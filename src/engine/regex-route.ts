import type { ToolEntry, ToolMatch } from "../config/schema.js";

/**
 * Regex fast-path: turn a tool's example phrases / regexes into compiled
 * matchers and route a raw question straight to a tool without the LLM.
 */

/**
 * Compile a ToolMatch into a RegExp.
 * - phrase: `{name}` -> named capture `(?<name>.+?)`, literal text escaped,
 *   runs of whitespace -> `\s+`, optional trailing punctuation tolerated.
 * - regex: `new RegExp(pattern, "i")`.
 */
export function compilePattern(m: ToolMatch): RegExp {
  if (m.kind === "regex") {
    return new RegExp(m.pattern, "i");
  }

  // Phrase. Split on placeholders, escape literals, collapse whitespace.
  const parts = m.pattern.split(/(\{[A-Za-z_][A-Za-z0-9_]*\})/g);
  let out = "";
  for (const part of parts) {
    if (part.length === 0) continue;
    const placeholder = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(part);
    if (placeholder) {
      out += `(?<${placeholder[1]}>.+?)`;
    } else {
      // Escape regex metachars, then turn whitespace runs into \s+.
      const escaped = part
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+");
      out += escaped;
    }
  }
  // Anchor, allow leading/trailing whitespace and optional trailing punctuation.
  return new RegExp(`^\\s*${out}\\s*[.!?]*\\s*$`, "i");
}

export interface RegexMatch {
  tool: ToolEntry;
  pattern: string;
  input: Record<string, string>;
}

/**
 * Scan enabled tools' enabled patterns in declaration order; first match wins.
 * Capture groups become input keys. If a tool declares a `query` input and the
 * pattern captured nothing for it, fall back to the whole question as `query`.
 */
export function matchTools(
  question: string,
  entries: ToolEntry[],
): RegexMatch | undefined {
  const q = question.trim();
  for (const tool of entries) {
    if (!tool.enabled) continue;
    for (const m of tool.match) {
      if (!m.enabled) continue;
      let re: RegExp;
      try {
        re = compilePattern(m);
      } catch {
        continue;
      }
      const result = re.exec(q);
      if (!result) continue;

      const input: Record<string, string> = {};
      const groups = result.groups ?? {};
      for (const [k, v] of Object.entries(groups)) {
        if (v !== undefined) input[k] = v.trim();
      }
      // Apply explicit input mapping if present (maps group name -> input key).
      if (m.input) {
        const mapped: Record<string, string> = {};
        for (const [groupName, inputKey] of Object.entries(m.input)) {
          const val = groups[groupName];
          if (val !== undefined) mapped[inputKey] = val.trim();
        }
        // Merge: explicit mappings win, but keep any unmapped captures.
        Object.assign(input, mapped);
      }

      // Fallback: tool declares a `query` input but it wasn't captured.
      const declaresQuery = tool.input && "query" in tool.input;
      if (declaresQuery && input["query"] === undefined) {
        input["query"] = q;
      }

      return { tool, pattern: m.pattern, input };
    }
  }
  return undefined;
}
