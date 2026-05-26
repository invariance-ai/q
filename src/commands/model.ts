import { Command } from "commander";
import chalk from "chalk";

import { getConfigValue, setConfigValue } from "../config/store.js";
import { resolveModel } from "../config/resolve.js";
import { KNOWN_MODELS, resolveProvider } from "../providers/index.js";
import { ConfigError, exitCodeFor } from "../util/errors.js";

const SAFFRON = "#f4a020";

function handle(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`error: ${message}`) + "\n");
    process.exitCode = exitCodeFor(err);
  }
}

export function buildModelCommand(): Command {
  const model = new Command("model").description("Inspect and switch the default model");

  // Bare `q model` → print current default + provider.
  model.action(() => {
    handle(() => {
      const current = resolveModel();
      const provider = resolveProvider(current);
      process.stdout.write(`${chalk.hex(SAFFRON)(current)}  ${chalk.dim(`(${provider})`)}\n`);
    });
  });

  model
    .command("set <id>")
    .description("Set the default model (must resolve to a known provider)")
    .action((id: string) => {
      handle(() => {
        // Throws if the provider can't be resolved — surface as a ConfigError.
        let provider: string;
        try {
          provider = resolveProvider(id);
        } catch {
          throw new ConfigError(
            `cannot resolve a provider for "${id}". Run \`q model list\` to see known models.`,
          );
        }
        setConfigValue("defaultModel", id);
        process.stdout.write(chalk.green(`default model set to ${id} (${provider})`) + "\n");
        // We can resolve a provider from the id prefix but can't verify the
        // model exists at that provider — warn so a later 404 isn't a surprise.
        if (!KNOWN_MODELS.includes(id)) {
          process.stderr.write(
            chalk.yellow(
              `note: "${id}" isn't in the known-models list; if it's a typo, requests will fail. See \`q model list\`.`,
            ) + "\n",
          );
        }
      });
    });

  model
    .command("list")
    .description("List known models, marking the current default")
    .action(() => {
      handle(() => {
        const current = (getConfigValue("defaultModel") as string | undefined) ?? resolveModel();
        for (const id of KNOWN_MODELS) {
          const isCurrent = id === current;
          const marker = isCurrent ? chalk.hex(SAFFRON)("●") : chalk.dim("○");
          const provider = chalk.dim(`(${resolveProvider(id)})`);
          const name = isCurrent ? chalk.bold(id) : id;
          process.stdout.write(`${marker} ${name} ${provider}\n`);
        }
      });
    });

  return model;
}
