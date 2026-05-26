import readline from "node:readline/promises";
import chalk from "chalk";

import { enableTelemetry, dismissPrompt, markPrompted } from "./state.js";

/**
 * Show the one-time opt-in prompt. The caller must gate this with
 * `shouldPrompt()`. Any decline — "n", empty, or X-ing out (Ctrl-C/EOF) — is
 * treated as a permanent dismissal, so we never ask again.
 */
export async function maybePromptOptIn(): Promise<void> {
  markPrompted();
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    process.stderr.write(
      "\n" +
        chalk.dim(
          "Help improve q? It can send anonymous usage data — never your questions, answers, or keys.",
        ) +
        "\n",
    );
    const answer = (await rl.question(chalk.hex("#f4a020")("Enable anonymous telemetry? [y/N] ")))
      .trim()
      .toLowerCase();
    if (answer === "y" || answer === "yes") {
      enableTelemetry();
      process.stderr.write(
        chalk.green("Thanks — telemetry on. Turn it off anytime: q telemetry off") + "\n",
      );
    } else {
      dismissPrompt();
      process.stderr.write(
        chalk.dim("No problem — I won't ask again. Enable later with: q telemetry on") + "\n",
      );
    }
  } catch {
    dismissPrompt();
  } finally {
    rl.close();
  }
}
