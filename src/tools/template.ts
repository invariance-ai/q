/**
 * Minimal, safe templating for tool definitions. Replaces `{{input.x}}` and
 * `{{env.X}}` tokens. Missing values become the empty string. No code is ever
 * evaluated.
 */
export function interpolate(
  tpl: string,
  ctx: { input: Record<string, unknown>; env: NodeJS.ProcessEnv },
): string {
  return tpl.replace(
    /\{\{\s*(input|env)\.([A-Za-z0-9_]+)\s*\}\}/g,
    (_match, scope: string, key: string) => {
      if (scope === "input") {
        const v = ctx.input[key];
        return v === undefined || v === null ? "" : String(v);
      }
      const v = ctx.env[key];
      return v === undefined ? "" : String(v);
    },
  );
}
