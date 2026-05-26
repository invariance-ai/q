import chalk from "chalk";
import { Command } from "commander";

/**
 * Launch the interactive chat UI. The Ink/React surface is loaded lazily so a
 * one-shot `q <question>` invocation never pays the Ink import cost (and stays
 * usable when piped). The chat module is owned by Agent C.
 */
export async function runChatCommand(opts: { model?: string }): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stderr.write(
      chalk.yellow("chat needs an interactive terminal; try: q <question>") + "\n",
    );
    return;
  }
  const { runChat } = await import("../chat/runChat.js");
  await runChat(opts);
}

export function buildChatCommand(): Command {
  return new Command("chat")
    .description("Start an interactive chat session")
    .option("-m, --model <id>", "model id to use for the session")
    .action(async (opts: { model?: string }) => {
      await runChatCommand(opts);
    });
}
