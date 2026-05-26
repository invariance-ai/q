import { Command } from "commander";
import chalk from "chalk";

import { readLastRun, flagLast } from "../engine/feedback.js";
import { exitCodeFor } from "../util/errors.js";

interface FlagOptions {
  disablePattern?: boolean;
  right?: boolean;
}

/** One-line description of what the last answer matched / how it was routed. */
function summarizeLastRun(): string | undefined {
  const last = readLastRun();
  if (!last) return undefined;
  if (last.routedVia === "regex") {
    const tool = last.tool ? ` via ${last.tool}` : "";
    const pattern = last.matchedPattern ? ` (matched: ${last.matchedPattern})` : "";
    return chalk.dim(`last: "${last.question}" → regex fast-path${tool}${pattern}`);
  }
  return chalk.dim(`last: "${last.question}" → llm (${last.model})`);
}

export function buildFlagCommand(): Command {
  const flag = new Command("flag")
    .description("Flag the last answer as wrong, optionally disabling its matched pattern")
    .argument("[note...]", "optional note about what went wrong")
    .option("--disable-pattern", "disable the regex/phrase pattern that matched last time")
    .option("--right", "record the last answer as correct (positive signal)")
    .action((noteWords: string[], opts: FlagOptions) => {
      try {
        const last = readLastRun();
        if (!last) {
          process.stderr.write(
            chalk.yellow("no recent run to flag. Ask something first: q <question>") + "\n",
          );
          process.exitCode = 1;
          return;
        }

        const summary = summarizeLastRun();
        if (summary) process.stdout.write(summary + "\n");

        const note = noteWords.length > 0 ? noteWords.join(" ") : undefined;
        const payload: { note?: string; disablePattern?: boolean; right?: boolean } = {};
        if (note !== undefined) payload.note = note;
        if (opts.disablePattern) payload.disablePattern = true;
        if (opts.right) payload.right = true;

        const result = flagLast(payload);
        process.stdout.write(chalk.green(result.message) + "\n");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(chalk.red(`error: ${message}`) + "\n");
        process.exitCode = exitCodeFor(err);
      }
    });

  return flag;
}
