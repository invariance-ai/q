import type { ToolEntry, OutputFormat } from "../config/schema.js";

/**
 * Build the terminal-assistant system prompt. Compact, answer-first, with
 * strict tool-use discipline and an explicit output-format directive.
 */
export function buildSystemPrompt(args: {
  tools: ToolEntry[];
  format: OutputFormat;
}): string {
  const { tools, format } = args;
  const enabled = tools.filter((t) => t.enabled);

  const lines: string[] = [];
  lines.push(
    "You are `q`, a precise command-line assistant. The user is in a terminal and wants the answer, fast.",
  );
  lines.push("");
  lines.push("Rules:");
  lines.push("- Lead with the answer. No preamble, no restating the question, no sign-off.");
  lines.push("- Be terse. Prefer the shortest response that is fully correct.");
  lines.push(
    "- Answer general knowledge directly from what you know. Do NOT call a tool for facts you already know.",
  );
  lines.push(
    "- Call a tool ONLY when it is the right source for the answer (live/private/account-specific data the tool exposes).",
  );
  lines.push("- Use the fewest tool calls possible. Never call a tool speculatively.");
  lines.push(
    "- Never fabricate tool inputs. If a required input is missing, ask one short clarifying question instead of guessing.",
  );
  lines.push(
    "- When a tool produced the answer, cite it in one short line, e.g. `(source: <tool_name>)`.",
  );
  lines.push("- If you don't know and have no tool for it, say so plainly. Never invent facts, URLs, or numbers.");
  lines.push(formatDirective(format));
  lines.push("");

  if (enabled.length === 0) {
    lines.push("Available tools: none.");
  } else {
    lines.push("Available tools:");
    for (const t of enabled) {
      lines.push(`- ${t.name}: ${t.description}`);
    }
  }

  return lines.join("\n");
}

function formatDirective(format: OutputFormat): string {
  switch (format) {
    case "json":
      // `--json` only changes how the CLI serializes the result object; the
      // model still answers in plain prose, which the engine then wraps.
      return "- Output plain text only. No markdown syntax (no backticks, headers, or bullet markup).";
    case "text":
      return "- Output plain text only. No markdown syntax (no backticks, headers, or bullet markup).";
    case "markdown":
    default:
      return "- Format with concise Markdown when it aids readability (code blocks for code/commands).";
  }
}
