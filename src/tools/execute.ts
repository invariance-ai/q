import type { ToolEntry } from "../config/schema.js";
import type { ToolCallRecord } from "../engine/types.js";
import { interpolate } from "./template.js";
import { redact } from "../util/redact.js";

/** Maximum bytes of response body we keep. */
const MAX_BODY_BYTES = 8 * 1024;

export interface ExecuteResult {
  ok: boolean;
  status?: number;
  body: string;
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
  opts?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<ExecuteResult> {
  const doFetch = opts?.fetchImpl ?? fetch;
  const ctx = { input, env: process.env };

  let url: string;
  try {
    url = interpolate(entry.url, ctx);
    const query = entry.query ?? {};
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      params.append(k, interpolate(v, ctx));
    }
    const qs = params.toString();
    if (qs.length > 0) {
      url += (url.includes("?") ? "&" : "?") + qs;
    }
  } catch (err) {
    return { ok: false, body: `Failed to build request URL: ${(err as Error).message}` };
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(entry.headers ?? {})) {
    headers[k] = interpolate(v, ctx);
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
    body = interpolate(entry.body, ctx);
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
      signal,
    });
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
