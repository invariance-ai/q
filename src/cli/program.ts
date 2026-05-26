import { Command } from "commander";

import { addGlobalOptions, collectGlobalFlags } from "./globals.js";
import { configureHelp, registerHelpTopics } from "./help.js";
import { runAsk, registerAskCommand } from "../commands/ask.js";
import { runChatCommand } from "../commands/chat.js";
import { buildConfigCommand } from "../commands/config.js";
import { buildModelCommand } from "../commands/model.js";
import { buildToolsCommand } from "../commands/tools.js";
import { buildFeatureCommand } from "../commands/feature.js";
import { buildFlagCommand } from "../commands/flag.js";
import { buildChatCommand } from "../commands/chat.js";
import { joinQuery } from "../util/argv.js";

/**
 * Build the root `q` commander program. Pure construction — no parsing — so it
 * can be exercised from tests.
 */
export function buildProgram(): Command {
  const program = new Command("q");

  program
    .version("0.1.0")
    // Free-text questions can contain anything; don't choke on "excess" words,
    // and keep options interspersed with the query (e.g. `q -m gpt-4o explain`).
    .allowExcessArguments(true)
    .enablePositionalOptions(false);

  // Global options live on the root so they're available to the default root
  // action (bare `q <question>`). The explicit `ask` command attaches its own
  // copy so they're visible in its help too.
  addGlobalOptions(program);
  configureHelp(program);

  // Subcommands.
  program.addCommand(buildConfigCommand());
  program.addCommand(buildModelCommand());
  program.addCommand(buildToolsCommand());
  program.addCommand(buildFeatureCommand());
  program.addCommand(buildFlagCommand());
  program.addCommand(buildChatCommand());

  // Explicit `ask <words...>`.
  registerAskCommand(program);

  registerHelpTopics(program);

  // Default root action: `q <query...>` → ask; `q` (empty) → chat.
  program
    .argument("[query...]", "your question (free text); omit to start chat")
    .action(async (query: string[]) => {
      const flags = collectGlobalFlags(program);
      if (query.length > 0) {
        await runAsk(joinQuery(query), flags);
      } else {
        const chatOpts: { model?: string } = {};
        if (flags.model !== undefined) chatOpts.model = flags.model;
        await runChatCommand(chatOpts);
      }
    });

  return program;
}
