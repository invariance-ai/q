import { Command } from "commander";
import chalk from "chalk";

import {
  getConfigPath,
  getConfigValue,
  setConfigValue,
  clearConfigValue,
  readConfig,
} from "../config/store.js";
import { redact } from "../util/redact.js";
import { exitCodeFor } from "../util/errors.js";

/** Render any config value as a redacted, human-readable string. */
function show(value: unknown): string {
  if (value === undefined) return chalk.dim("(unset)");
  const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return redact(str);
}

function handle(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`error: ${message}`) + "\n");
    process.exitCode = exitCodeFor(err);
  }
}

export function buildConfigCommand(): Command {
  const config = new Command("config").description("Read and write CLI configuration");

  config
    .command("get <key>")
    .description("Print a config value (secrets are redacted)")
    .action((key: string) => {
      handle(() => {
        process.stdout.write(show(getConfigValue(key)) + "\n");
      });
    });

  config
    .command("set <key> <value>")
    .description("Set a config value (dot path, e.g. features.tools)")
    .action((key: string, value: string) => {
      handle(() => {
        setConfigValue(key, value);
        process.stdout.write(chalk.green(`set ${key}`) + "\n");
      });
    });

  config
    .command("list")
    .description("Print the full resolved config (secrets are redacted)")
    .action(() => {
      handle(() => {
        const cfg = readConfig();
        process.stdout.write(redact(JSON.stringify(cfg, null, 2)) + "\n");
      });
    });

  config
    .command("path")
    .description("Print the config file path")
    .action(() => {
      handle(() => {
        process.stdout.write(getConfigPath() + "\n");
      });
    });

  config
    .command("clear [key]")
    .description("Clear one key, or the entire config if no key is given")
    .action((key?: string) => {
      handle(() => {
        clearConfigValue(key);
        process.stdout.write(chalk.green(key ? `cleared ${key}` : "cleared config") + "\n");
      });
    });

  return config;
}
