import chalk from "chalk";

import { buildProgram } from "./cli/program.js";
import { isReserved } from "./cli/reserved.js";
import { detectGlobRisk } from "./util/argv.js";
import { exitCodeFor } from "./util/errors.js";

const HELP_VERSION_FLAGS = new Set(["-h", "--help", "-V", "--version"]);

/** First token that isn't an option flag — the routing decision point. */
function firstNonFlagToken(argv: string[]): string | undefined {
  return argv.find((a) => !a.startsWith("-"));
}

/**
 * Decide whether the invocation targets a reserved subcommand / built-in flag,
 * or is free-text that should fall through to the default `ask` root action.
 *
 * Both cases ultimately go through `program.parseAsync` — commander routes a
 * reserved first token to its subcommand and anything else to the `[query...]`
 * root argument. We compute the classification explicitly so the intent is
 * legible (and so the entry point reads as the documented dispatcher).
 */
function classify(argv: string[]): "command" | "freetext" {
  const first = firstNonFlagToken(argv);
  if (first === undefined) {
    // Only flags (e.g. `q --help`, `q --version`) or nothing at all.
    const anyHelpVersion = argv.some((a) => HELP_VERSION_FLAGS.has(a));
    return anyHelpVersion || argv.length === 0 ? "command" : "freetext";
  }
  return isReserved(first) ? "command" : "freetext";
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const program = buildProgram();

  // Hint (not an error) when the shell likely expanded a glob in the question,
  // e.g. `q what files match *.ts`. TTY-only so we never pollute pipes.
  if (process.stdout.isTTY && detectGlobRisk(argv)) {
    process.stderr.write(
      chalk.dim(
        "hint: a `*`/`?` in your question may have been expanded by your shell. " +
          'Quote it ("...") or prefix with `noglob`.',
      ) + "\n",
    );
  }

  // Both classifications parse through commander; `freetext` is carried by the
  // default `[query...]` root argument registered in buildProgram().
  void classify(argv);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(chalk.red(`error: ${message}`) + "\n");
  process.exitCode = exitCodeFor(err);
});
