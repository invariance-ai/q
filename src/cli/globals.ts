import type { Command, OptionValueSource } from "commander";

import type { AskParams } from "../engine/types.js";
import type { OutputFormat } from "../config/schema.js";

/**
 * Global flags shared by the root action and the explicit `ask` command.
 * These map onto the engine's {@link AskParams} via {@link toAskParams}.
 */
export interface GlobalFlags {
  model?: string;
  /** From `--no-tools` (commander negates to `tools: false`). */
  tools?: boolean;
  /** From `--no-stream`. */
  stream?: boolean;
  /** From `--think` / `--no-think`. */
  think?: boolean;
  format?: OutputFormat;
  json?: boolean;
  dryRun?: boolean;
  /** From `--phrase` / `--no-phrase` (regex fast-path LLM phrasing). */
  phrase?: boolean;
}

/**
 * Attach the shared global options to a command. Commander turns `--no-foo`
 * into a `foo` option defaulting to `true`, so consumers must treat an absent
 * value as "use the configured default", not "false".
 */
export function addGlobalOptions(cmd: Command): Command {
  return cmd
    .option("-m, --model <id>", "model id to use (overrides default)")
    .option("--no-tools", "disable tool-calling for this run")
    .option("--no-stream", "disable token streaming")
    .option("--think", "enable extended thinking")
    .option("--no-think", "disable extended thinking")
    .option("--format <fmt>", "output format: markdown | text | json")
    .option("--json", "shorthand for --format json")
    .option("--dry-run", "render the prompt + planned calls without calling the network")
    .option("--no-phrase", "skip LLM phrasing of regex fast-path results")
    .option("--phrase", "phrase regex fast-path results through the LLM");
}

/**
 * Collect global flags from a command, keeping only options the user actually
 * set on the command line (or via env). This matters for the negatable
 * booleans (`--no-tools`, `--no-stream`, `--no-think`, `--no-phrase`): commander
 * gives them a default of `true`, so reading `cmd.opts()` blindly would always
 * forward `tools: true` and clobber a configured `features.tools = false`. By
 * filtering on the option source we forward an override only when present.
 */
export function collectGlobalFlags(cmd: Command): GlobalFlags {
  const opts = cmd.opts<GlobalFlags & Record<string, unknown>>();
  const wasSet = (name: string): boolean => {
    const src: OptionValueSource | undefined = cmd.getOptionValueSource(name);
    return src === "cli" || src === "env";
  };

  const flags: GlobalFlags = {};
  if (wasSet("model") && opts.model !== undefined) flags.model = opts.model;
  if (wasSet("tools")) flags.tools = opts.tools;
  if (wasSet("stream")) flags.stream = opts.stream;
  if (wasSet("think")) flags.think = opts.think;
  if (wasSet("phrase")) flags.phrase = opts.phrase;
  if (wasSet("format") && opts.format !== undefined) flags.format = opts.format;
  if (wasSet("json")) flags.json = opts.json;
  if (wasSet("dryRun")) flags.dryRun = opts.dryRun;
  return flags;
}

/** Resolve the effective output format from the flags. `--json` wins. */
function resolveFormat(flags: GlobalFlags): OutputFormat | undefined {
  if (flags.json) return "json";
  return flags.format;
}

/**
 * Map global CLI flags onto engine {@link AskParams}. Only flags the user
 * actually set are forwarded; the engine fills the rest from config so we don't
 * clobber configured defaults with `undefined`-driven negations.
 */
export function toAskParams(question: string, flags: GlobalFlags): AskParams {
  const params: AskParams = { question };

  if (flags.model !== undefined) params.model = flags.model;
  // Commander only sets `tools`/`think`/`phrase` when a flag is present.
  if (flags.tools !== undefined) params.tools = flags.tools;
  if (flags.think !== undefined) params.think = flags.think;
  if (flags.phrase !== undefined) params.phrase = flags.phrase;
  if (flags.dryRun) params.dryRun = true;

  const format = resolveFormat(flags);
  if (format !== undefined) params.format = format;

  return params;
}
