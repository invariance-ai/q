import chalk from "chalk";

import { createEngine } from "../engine/engine.js";
import { resolveFeatures } from "../config/resolve.js";
import { exitCodeFor } from "../util/errors.js";
import type { OutputFormat } from "../config/schema.js";
import {
  addGlobalOptions,
  collectGlobalFlags,
  toAskParams,
  type GlobalFlags,
} from "../cli/globals.js";
import { renderAnswer, formatToolEvent } from "../render/output.js";
import { Command } from "commander";

/** Effective output format for the run (`--json` wins over `--format`). */
function effectiveFormat(flags: GlobalFlags): OutputFormat {
  if (flags.json) return "json";
  return flags.format ?? resolveFeatures().format;
}

/**
 * Decide whether to stream. Stream only on an interactive stdout, when the
 * stream feature is on, when JSON wasn't requested, and `--no-stream` wasn't
 * passed. JSON output is always rendered atomically at the end.
 */
function shouldStream(flags: GlobalFlags): boolean {
  if (flags.json) return false;
  if (flags.stream === false) return false;
  if (!process.stdout.isTTY) return false;
  return resolveFeatures({ stream: flags.stream }).stream;
}

export async function runAsk(question: string, flags: GlobalFlags): Promise<void> {
  const format = effectiveFormat(flags);
  const params = toAskParams(question, flags);

  try {
    const engine = createEngine();

    if (flags.dryRun) {
      const result = await engine.ask({ ...params, dryRun: true });
      // Always emit the dry-run plan as JSON so it can be inspected/piped.
      const info = result.dryRun ?? { system: "", messages: [], tools: [] };
      process.stdout.write(JSON.stringify(info, null, 2) + "\n");
      return;
    }

    if (shouldStream(flags)) {
      for await (const event of engine.stream(params)) {
        switch (event.type) {
          case "text_delta":
            process.stdout.write(event.text);
            break;
          case "tool_call_start":
          case "tool_call_end":
          case "routed": {
            const line = formatToolEvent(event);
            if (line) process.stderr.write(line + "\n");
            break;
          }
          case "done":
            process.stdout.write("\n");
            break;
          case "error":
            process.stderr.write(chalk.red(`error: ${event.error}`) + "\n");
            process.exitCode = 1;
            break;
          default:
            break;
        }
      }
      return;
    }

    const result = await engine.ask(params);
    process.stdout.write(renderAnswer(result, { format }) + "\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`error: ${message}`) + "\n");
    process.exitCode = exitCodeFor(err);
  }
}

/**
 * The explicit `ask <words...>` command. The default root action handles the
 * bare `q <question>` form; this exists so `q ask --json "..."` is unambiguous.
 */
export function registerAskCommand(program: Command): void {
  const cmd = program
    .command("ask <words...>")
    .description("Ask a one-shot question (explicit form of `q <question>`)")
    .action(async (words: string[], _opts: GlobalFlags, command: Command) => {
      await runAsk(words.join(" "), collectGlobalFlags(command));
    });
  addGlobalOptions(cmd);
}
