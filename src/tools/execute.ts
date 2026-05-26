import type { ToolEntry, ToolInputParam } from "../config/schema.js";
import type { ToolCallRecord } from "../engine/types.js";
import { interpolate } from "./template.js";
import { guardUrl, type LookupFn } from "./ssrf.js";
import { redact } from "../util/redact.js";

/** Maximum bytes of response body we keep. */
const MAX_BODY_BYTES = 8 * 1024;

export interface ExecuteResult {
  ok: boolean;
  status?: number;
  body: string;
}

/**
 * Validate caller-/LLM-supplied `input` against the tool's declared `input`
 * contract before any interpolation. Required params must be present; values
 * are coerced to the declared scalar type; unknown keys are dropped (so they
 * can never be interpolated). Tools with no declared `input` keep the legacy
 * behavior of accepting arbitrary string values.
 *
 * Returns `{ ok: true, input }` with the sanitized map, or `{ ok: false,
 * reason }` describing the first problem.
 */
export function validateInput(
  entry: ToolEntry,
  input: Record<string, unknown>,
):
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; reason: string } {
  const params = entry.input;
  if (!params) {
    // No declared contract: accept everything as strings (legacy behavior).
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined || v === null) continue;
      out[k] = String(v);
    }
    return { ok: true, input: out };
  }

  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(params)) {
    const present = Object.prototype.hasOwnProperty.call(input, name);
    const raw = input[name];
    if (!present || raw === undefined || raw === null || raw === "") {
      if (spec.required) {
        return { ok: false, reason: `missing required input: ${name}` };
      }
      continue;
    }
    const coerced = coerce(raw, spec);
    if (coerced === undefined) {
      return {
        ok: false,
        reason: `input '${name}' must be a ${spec.type}`,
      };
    }
    out[name] = coerced;
  }
  // Unknown keys (not in the declared contract) are intentionally dropped.
  return { ok: true, input: out };
}

/** Coerce a raw value to the declared scalar type; undefined = not coercible. */
function coerce(raw: unknown, spec: ToolInputParam): unknown {
  switch (spec.type) {
    case "string":
      if (typeof raw === "object") return undefined;
      return String(raw);
    case "number": {
      if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
      if (typeof raw === "string" && raw.trim() !== "") {
        const n = Number(raw);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Execute a registered tool as an HTTP request. Interpolates url/query/headers/
 * body, injects auth from the configured env var, enforces a timeout (combined
 * with any caller signal), and caps the response body. Never throws on network
 * errors — returns `{ ok: false, body: <message> }` so the caller can decide.
 */
export async function executeTool(
  entry: ToolEntry,
  input: Record<string, unknown>,
  opts?: { signal?: AbortSignal; fetchImpl?: typeof fetch; lookupFn?: LookupFn },
): Promise<ExecuteResult> {
  const doFetch = opts?.fetchImpl ?? fetch;

  // 1) Validate + sanitize input before any interpolation. Unknown keys are
  //    dropped; missing required params are rejected.
  const validated = validateInput(entry, input);
  if (!validated.ok) {
    return { ok: false, body: validated.reason };
  }
  const ctx = { input: validated.input, env: process.env };

  let url: string;
  try {
    // 2) URL path: encodeURIComponent each interpolated value so a value like
    //    "../../admin" or "a/b c" can't escape its path segment. But when the
    //    value IS the whole URL (e.g. web_fetch's `{{input.url}}`), encoding it
    //    corrupts the scheme/host — so if the encoded form isn't a valid http(s)
    //    URL, fall back to raw interpolation. The SSRF guard below validates
    //    the final URL either way.
    const encoded = interpolate(entry.url, ctx, { encode: "url" });
    url = isParsableHttpUrl(encoded)
      ? encoded
      : interpolate(entry.url, ctx, { encode: "none" });
    const query = entry.query ?? {};
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      // URLSearchParams already encodes; pass raw so we don't double-encode.
      params.append(k, interpolate(v, ctx, { encode: "none" }));
    }
    const qs = params.toString();
    if (qs.length > 0) {
      url += (url.includes("?") ? "&" : "?") + qs;
    }
  } catch (err) {
    return { ok: false, body: `Failed to build request URL: ${(err as Error).message}` };
  }

  // 3) SSRF guard: block private/internal targets unless opted in per tool.
  if (!entry.allowPrivateNetwork) {
    const guard = await guardUrl(url, opts?.lookupFn ? { lookupFn: opts.lookupFn } : undefined);
    if (guard.blocked) {
      return { ok: false, status: undefined, body: `blocked: ${guard.reason}` };
    }
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(entry.headers ?? {})) {
    // Strip CR/LF from header values to prevent header injection.
    headers[k] = interpolate(v, ctx, { encode: "header" });
  }

  // Inject auth from the configured env var (never from input).
  if (entry.auth) {
    const token = process.env[entry.auth.envVar];
    if (token) {
      if (entry.auth.type === "bearer") {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        const headerName = entry.auth.headerName || "Authorization";
        headers[headerName] = token;
      }
    }
  }

  let body: string | undefined;
  const method = entry.method;
  if (entry.body && method !== "GET" && method !== "DELETE") {
    // Caveat: the body is a JSON string template; interpolated values are
    // substituted raw (encode:"none"). A value containing `"` or `}` can alter
    // the JSON structure. We intentionally do not change body semantics here —
    // tool authors must template bodies they trust. URL/header contexts above
    // ARE contextually encoded.
    body = interpolate(entry.body, ctx, { encode: "none" });
    if (!("Content-Type" in headers) && !("content-type" in headers)) {
      headers["Content-Type"] = "application/json";
    }
  }

  // Combine the per-tool timeout with any caller-provided signal.
  const timeoutSignal = AbortSignal.timeout(entry.timeoutMs);
  const signal = opts?.signal
    ? anySignal([opts.signal, timeoutSignal])
    : timeoutSignal;

  try {
    const res = await doFetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      // 4) Never auto-follow redirects: a 302 could send Authorization /
      //    custom-header tokens to an attacker-controlled host.
      redirect: "manual",
      signal,
    });
    // A 3xx with manual redirect means we refused to follow. Treat as blocked.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") ?? "<unknown>";
      return { ok: false, status: res.status, body: `blocked redirect to ${location}` };
    }
    const text = await readCapped(res);
    return { ok: res.ok, status: res.status, body: text };
  } catch (err) {
    const e = err as Error;
    const reason =
      e.name === "TimeoutError" || e.name === "AbortError"
        ? `Request aborted or timed out after ${entry.timeoutMs}ms`
        : e.message;
    return { ok: false, body: `Tool request failed: ${reason}` };
  }
}

/** True if `s` parses as an absolute http(s) URL. */
function isParsableHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function readCapped(res: Response): Promise<string> {
  const full = await res.text();
  if (full.length <= MAX_BODY_BYTES) return full;
  return full.slice(0, MAX_BODY_BYTES) + "\n…[truncated]";
}

/** Polyfill-free combiner for multiple AbortSignals. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const anyFn = (
    AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }
  ).any;
  if (typeof anyFn === "function") return anyFn(signals);
  const controller = new AbortController();
  const onAbort = (s: AbortSignal) => () => controller.abort(s.reason);
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", onAbort(s), { once: true });
  }
  return controller.signal;
}

/**
 * Build a redacted ToolCallRecord from an execution result. The body preview is
 * passed through `redact()` and truncated.
 */
export function toToolCallRecord(args: {
  tool: string;
  input: Record<string, unknown>;
  result: ExecuteResult;
  durationMs: number;
  previewLimit?: number;
}): ToolCallRecord {
  const { tool, input, result, durationMs } = args;
  const limit = args.previewLimit ?? 1000;
  const preview = redact(result.body).slice(0, limit);
  const record: ToolCallRecord = {
    tool,
    input,
    ok: result.ok,
    durationMs,
    resultPreview: preview,
  };
  if (result.status !== undefined) record.status = result.status;
  if (!result.ok) record.error = preview;
  return record;
}
