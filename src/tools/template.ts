/**
 * Minimal, safe templating for tool definitions. Replaces `{{input.x}}` and
 * `{{env.X}}` tokens. Missing values become the empty string. No code is ever
 * evaluated.
 */

/**
 * How to encode each interpolated value for the surrounding context:
 * - "none":   raw substitution (default — preserves legacy behavior).
 * - "url":    `encodeURIComponent` each value (safe for path segments + query
 *             param values; neutralizes `../`, spaces, apostrophes, etc.).
 * - "header": strip CR/LF so a value can't inject extra headers (response/
 *             request splitting).
 */
export type EncodeMode = "none" | "url" | "header";

function encodeValue(value: string, mode: EncodeMode): string {
  switch (mode) {
    case "url":
      return encodeURIComponent(value);
    case "header":
      // Defeat header injection: drop CR/LF entirely.
      return value.replace(/[\r\n]/g, "");
    case "none":
    default:
      return value;
  }
}

export function interpolate(
  tpl: string,
  ctx: { input: Record<string, unknown>; env: NodeJS.ProcessEnv },
  opts?: { encode?: EncodeMode },
): string {
  const mode = opts?.encode ?? "none";
  return tpl.replace(
    /\{\{\s*(input|env)\.([A-Za-z0-9_]+)\s*\}\}/g,
    (_match, scope: string, key: string) => {
      let raw: string;
      if (scope === "input") {
        const v = ctx.input[key];
        raw = v === undefined || v === null ? "" : String(v);
      } else {
        const v = ctx.env[key];
        raw = v === undefined ? "" : String(v);
      }
      return encodeValue(raw, mode);
    },
  );
}
