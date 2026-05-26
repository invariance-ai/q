/**
 * Mask high-confidence secrets in arbitrary text before it is persisted
 * (last.json / feedback.jsonl) or shown in previews. Conservative: only
 * patterns with very low false-positive rates are masked.
 */

const MASK = "***";

interface Rule {
  re: RegExp;
  /**
   * If set, keep capture groups 1..keep verbatim and replace the remainder of
   * the match with the mask. If unset, replace the whole match.
   */
  keep?: number;
}

const RULES: Rule[] = [
  // PEM blocks (private keys / certs) — collapse the whole block.
  {
    re: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
  },
  // JWTs: header.payload.signature, each base64url. Check before generic sk-.
  { re: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  // Anthropic keys (must come before generic sk-).
  { re: /\bsk-ant-[A-Za-z0-9_-]{8,}/g },
  // OpenAI-style sk-/rk- keys.
  { re: /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}/g },
  // GitHub tokens.
  { re: /\bgh[posru]_[A-Za-z0-9]{16,}/g },
  // Slack tokens.
  { re: /\bxox[baprs]-[A-Za-z0-9-]{8,}/g },
  // AWS access key id.
  { re: /\bAKIA[0-9A-Z]{16}\b/g },
  // Google API keys.
  { re: /\bAIza[0-9A-Za-z_-]{20,}/g },
  // Bearer tokens — keep the "Bearer " prefix (group 1), mask the token.
  { re: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/g, keep: 1 },
  // Generic assignments: authorization/token/api_key/secret : <value>.
  // Keep the key + separator (group 1), mask the value.
  {
    re: /((?:authorization|token|api[_-]?key|secret)["']?\s*[:=]\s*["']?)(?!Bearer\b|Basic\b)([A-Za-z0-9._~+/=-]{6,})/gi,
    keep: 1,
  },
];

export function redact(input: string): string {
  let out = input;
  for (const rule of RULES) {
    if (rule.keep === undefined) {
      out = out.replace(rule.re, MASK);
    } else {
      const keep = rule.keep;
      out = out.replace(rule.re, (...args) => {
        // args: [match, g1, g2, ..., offset, string]
        const prefix = (args[keep] as string | undefined) ?? "";
        return prefix + MASK;
      });
    }
  }
  return out;
}
