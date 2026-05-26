/**
 * Helpers for interpreting raw `q` argv as a natural-language query versus a
 * shell-mangled token stream.
 */

/** Join positional words into a single trimmed query string. */
export function joinQuery(words: string[]): string {
  return words.join(" ").replace(/\s+/g, " ").trim();
}

/** Heuristic: looks like a sentence/question rather than a single keyword. */
export function looksLikeSentence(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.endsWith("?")) return true;
  return trimmed.split(/\s+/).filter(Boolean).length > 1;
}

/**
 * True if any argv token contains an unescaped glob metacharacter (`?`, `*`,
 * `[`) — used to warn that the shell may have expanded/eaten the question.
 */
export function detectGlobRisk(argv: string[]): boolean {
  for (const token of argv) {
    for (let i = 0; i < token.length; i++) {
      const ch = token[i];
      if (ch === "?" || ch === "*" || ch === "[") {
        // Treat a preceding backslash as an escape.
        if (i > 0 && token[i - 1] === "\\") continue;
        return true;
      }
    }
  }
  return false;
}
