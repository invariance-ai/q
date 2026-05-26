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
import { capture, addContext } from "../telemetry/capture.js";
import { recordRun, shouldPrompt } from "../telemetry/state.js";
import { maybePromptOptIn } from "../telemetry/prompt.js";
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
  const started = Date.now();

  // Dry-run is a local inspection; no telemetry, no run-count, no prompt.
  if (flags.dryRun) {
    try {
      const engine = createEngine();
      const result = await engine.ask({ ...params, dryRun: true });
      const info = result.dryRun ?? { system: "", messages: [], tools: [] };
      process.stdout.write(JSON.stringify(info, null, 2) + "\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(chalk.red(`error: ${message}`) + "\n");
      process.exitCode = exitCodeFor(err);
    }
    return;
  }

  recordRun();

  try {
    const engine = createEngine();

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
            if (event.result) {
              addContext({
                provider: event.result.provider,
                model: event.result.model,
                routedVia: event.result.routedVia,
              });
            }
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
      capture("ask", { command: "ask", ok: true, durationMs: Date.now() - started });
    } else {
      const result = await engine.ask(params);
      process.stdout.write(renderAnswer(result, { format }) + "\n");
      capture("ask", {
        command: "ask",
        provider: result.provider,
        model: result.model,
        routedVia: result.routedVia,
        ok: true,
        durationMs: Date.now() - started,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`error: ${message}`) + "\n");
    process.exitCode = exitCodeFor(err);
    capture("ask", {
      command: "ask",
      ok: false,
      errorKind: err instanceof Error ? err.name : "Error",
      durationMs: Date.now() - started,
    });
  }

  // After a normal interactive run, occasionally offer the telemetry opt-in.
  if (!flags.json && shouldPrompt()) {
    await maybePromptOptIn();
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
