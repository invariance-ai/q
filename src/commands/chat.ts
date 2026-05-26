import chalk from "chalk";
import { Command } from "commander";

import { capture } from "../telemetry/capture.js";
import { recordRun } from "../telemetry/state.js";

export interface ChatCommandOptions {
  model?: string;
  resume?: string;
  continue?: boolean;
}

/**
 * Launch the interactive chat UI. The Ink/React surface is loaded lazily so a
 * one-shot `q <question>` invocation never pays the Ink import cost (and stays
 * usable when piped).
 */
export async function runChatCommand(opts: ChatCommandOptions): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stderr.write(
      chalk.yellow("chat needs an interactive terminal; try: q <question>") + "\n",
    );
    return;
  }
  recordRun();
  capture("chat", { command: "chat" });
  const { runChat } = await import("../chat/runChat.js");
  await runChat({
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.resume ? { resume: opts.resume } : {}),
    ...(opts.continue ? { continueLatest: true } : {}),
  });
}

export function buildChatCommand(): Command {
  return new Command("chat")
    .description("Start an interactive chat session")
    .option("-m, --model <id>", "model id to use for the session")
    .option("--resume <id>", "resume a saved session by id (or unique prefix)")
    .option("--continue", "resume the most recent session")
    .action(async (opts: ChatCommandOptions) => {
      await runChatCommand(opts);
    });
}
