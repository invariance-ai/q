import { Command } from "commander";
import chalk from "chalk";

import { setConfigValue } from "../config/store.js";
import { resolveFeatures } from "../config/resolve.js";
import { OutputFormatSchema } from "../config/schema.js";
import { ConfigError, exitCodeFor } from "../util/errors.js";

const SAFFRON = "#f4a020";

/** Map the user-facing feature name → the config feature flag key. */
const FEATURE_KEYS: Record<string, string> = {
  tools: "tools",
  stream: "stream",
  think: "think",
  regexPhraseWithLLM: "regexPhraseWithLLM",
};

function handle(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`error: ${message}`) + "\n");
    process.exitCode = exitCodeFor(err);
  }
}

function parseOnOff(value: string): boolean {
  const v = value.toLowerCase();
  if (v === "on" || v === "true" || v === "yes") return true;
  if (v === "off" || v === "false" || v === "no") return false;
  throw new ConfigError(`expected on|off, got "${value}"`);
}

function printList(): void {
  const f = resolveFeatures();
  const row = (label: string, on: boolean) =>
    `${on ? chalk.green("on ") : chalk.dim("off")}  ${label}`;
  process.stdout.write(row("tools", f.tools) + "\n");
  process.stdout.write(row("stream", f.stream) + "\n");
  process.stdout.write(row("think", f.think) + "\n");
  process.stdout.write(row("regexPhraseWithLLM", f.regexPhraseWithLLM) + "\n");
  process.stdout.write(`${chalk.hex(SAFFRON)(f.format)}  format\n`);
}

function setFormat(fmt: string): void {
  const parsed = OutputFormatSchema.safeParse(fmt);
  if (!parsed.success) {
    throw new ConfigError(`invalid format "${fmt}" (markdown | text | json)`);
  }
  setConfigValue("features.format", parsed.data);
  process.stdout.write(chalk.green(`default format set to ${parsed.data}`) + "\n");
}

function toggle(name: string, state: string | undefined): void {
  const key = FEATURE_KEYS[name];
  if (!key) {
    throw new ConfigError(
      `unknown feature "${name}". Known: ${Object.keys(FEATURE_KEYS).join(", ")} (or "format <fmt>", "list")`,
    );
  }
  if (state === undefined) {
    throw new ConfigError(`usage: q feature ${name} <on|off>`);
  }
  const on = parseOnOff(state);
  setConfigValue(`features.${key}`, String(on));
  process.stdout.write(chalk.green(`${name} ${on ? "on" : "off"}`) + "\n");
}

export function buildFeatureCommand(): Command {
  // A single command with positional args lets us support all three shapes:
  //   q feature list
  //   q feature format <fmt>
  //   q feature <name> <on|off>
  const feature = new Command("feature")
    .description("Toggle feature flags (q feature <name> <on|off> | format <fmt> | list)")
    .argument("<target>", "feature name, or `format`, or `list`")
    .argument("[value]", "on|off for a feature, or a format name")
    .action((target: string, value: string | undefined) => {
      handle(() => {
        if (target === "list") {
          printList();
          return;
        }
        if (target === "format") {
          if (value === undefined)
            throw new ConfigError("usage: q feature format <markdown|text|json>");
          setFormat(value);
          return;
        }
        toggle(target, value);
      });
    });

  return feature;
}
