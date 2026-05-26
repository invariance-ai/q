import chalk from "chalk";

import type { AskResult, StreamEvent } from "../engine/types.js";
import { renderMarkdownLite } from "./markdown.js";

/**
 * Render a completed answer for one-shot output.
 *  - markdown → light terminal markdown
 *  - text     → the raw answer string
 *  - json     → the full result, pretty-printed
 */
export function renderAnswer(
  result: AskResult,
  opts: { format: "markdown" | "text" | "json" },
): string {
  switch (opts.format) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "text":
      return result.answer;
    case "markdown":
    default:
      return renderMarkdownLite(result.answer);
  }
}

/**
 * Convert a streaming progress event into a single dim status line for stderr.
 * Returns `undefined` for events that produce visible output elsewhere
 * (`text_delta`, `thinking_delta`, `done`, `error`).
 */
export function formatToolEvent(e: StreamEvent): string | undefined {
  switch (e.type) {
    case "tool_call_start":
      return chalk.dim(`→ calling tool: ${e.tool}`);
    case "tool_call_end": {
      const { record } = e;
      const mark = record.ok ? "✓" : "✗";
      const status = record.status !== undefined ? ` (${record.status})` : "";
      return chalk.dim(`${mark} ${record.tool}${status}`);
    }
    case "routed": {
      if (e.via === "regex") {
        const pattern = e.pattern ?? e.tool ?? "fast-path";
        return chalk.dim(`→ matched: ${pattern}`);
      }
      return chalk.dim("→ routed: llm");
    }
    default:
      return undefined;
  }
}
