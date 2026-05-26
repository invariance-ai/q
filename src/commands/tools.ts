import fs from "node:fs";

import { Command } from "commander";
import chalk from "chalk";

import {
  listToolEntries,
  addTool,
  removeTool,
  setToolEnabled,
  getTool,
  EXAMPLE_TOOLS,
} from "../tools/registry.js";
import { executeTool } from "../tools/execute.js";
import { ToolEntrySchema, type ToolEntry, type ToolMatch } from "../config/schema.js";
import { redact } from "../util/redact.js";
import { ToolError, exitCodeFor } from "../util/errors.js";

const SAFFRON = "#f4a020";

function handle(fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(chalk.red(`error: ${message}`) + "\n");
      process.exitCode = exitCodeFor(err);
    });
}

/** Parse repeated `k=v` strings into a record (later keys win). */
function parseKeyValues(pairs: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of pairs ?? []) {
    const idx = raw.indexOf("=");
    if (idx === -1) {
      throw new ToolError(`invalid k=v pair: "${raw}" (expected key=value)`);
    }
    out[raw.slice(0, idx)] = raw.slice(idx + 1);
  }
  return out;
}

interface AddOptions {
  name?: string;
  url?: string;
  method?: string;
  desc?: string;
  authType?: string;
  authEnv?: string;
  headerName?: string;
  match?: string[];
  example?: string;
}

function buildEntryFromOptions(opts: AddOptions): unknown {
  // Seed from an example, then layer explicit options on top.
  const seed: Record<string, unknown> = opts.example
    ? structuredClone(EXAMPLE_TOOLS[opts.example] ?? {})
    : {};
  if (opts.example && EXAMPLE_TOOLS[opts.example] === undefined) {
    throw new ToolError(
      `unknown example "${opts.example}". Known: ${Object.keys(EXAMPLE_TOOLS).join(", ")}`,
    );
  }

  const entry: Record<string, unknown> = { ...seed };

  if (opts.name !== undefined) entry["name"] = opts.name;
  if (opts.url !== undefined) entry["url"] = opts.url;
  if (opts.method !== undefined) entry["method"] = opts.method.toUpperCase();
  if (opts.desc !== undefined) entry["description"] = opts.desc;

  if (opts.authType !== undefined || opts.authEnv !== undefined) {
    const auth: Record<string, unknown> = {
      ...(typeof seed["auth"] === "object" && seed["auth"] ? (seed["auth"] as object) : {}),
    };
    if (opts.authType !== undefined) auth["type"] = opts.authType;
    if (opts.authEnv !== undefined) auth["envVar"] = opts.authEnv;
    if (opts.headerName !== undefined) auth["headerName"] = opts.headerName;
    entry["auth"] = auth;
  }

  if (opts.match && opts.match.length > 0) {
    const matches: ToolMatch[] = opts.match.map((pattern) => ({
      pattern,
      kind: "phrase" as const,
      enabled: true,
    }));
    entry["match"] = matches;
  }

  return entry;
}

function formatEnabled(enabled: boolean): string {
  return enabled ? chalk.green("on ") : chalk.dim("off");
}

export function buildToolsCommand(): Command {
  const tools = new Command("tools").description("Register and manage HTTP API tools");

  tools
    .command("list")
    .description("List registered tools")
    .action(() => {
      handle(() => {
        const entries = listToolEntries();
        if (entries.length === 0) {
          process.stdout.write(
            chalk.dim("no tools registered. Try: q tools add --example web_fetch") + "\n",
          );
          return;
        }
        for (const t of entries) {
          const url = redact(t.url);
          process.stdout.write(
            `${formatEnabled(t.enabled)}  ${chalk.hex(SAFFRON)(t.name.padEnd(16))} ${chalk.dim(url)}\n`,
          );
        }
      });
    });

  tools
    .command("add")
    .description("Register a new HTTP API tool")
    .option("--name <name>", "tool name (lowercase, digits, underscores)")
    .option("--url <url>", "endpoint URL")
    .option("--method <method>", "HTTP method (GET, POST, ...)")
    .option("--desc <text>", "when-to-use description")
    .option("--auth-type <type>", "auth type: bearer | header")
    .option("--auth-env <name>", "env var holding the token")
    .option("--header-name <name>", "header name for auth-type header")
    .option("--match <phrase...>", "fast-path phrase pattern(s)")
    .option("--example <name>", "seed from a built-in example tool")
    .action((opts: AddOptions) => {
      handle(() => {
        const raw = buildEntryFromOptions(opts);
        const parsed = ToolEntrySchema.safeParse(raw);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n");
          throw new ToolError(`invalid tool definition:\n${issues}`);
        }
        addTool(parsed.data);
        process.stdout.write(chalk.green(`added tool "${parsed.data.name}"`) + "\n");
      });
    });

  tools
    .command("remove <name>")
    .description("Remove a registered tool")
    .action((name: string) => {
      handle(() => {
        removeTool(name);
        process.stdout.write(chalk.green(`removed tool "${name}"`) + "\n");
      });
    });

  tools
    .command("enable <name>")
    .description("Enable a tool")
    .action((name: string) => {
      handle(() => {
        setToolEnabled(name, true);
        process.stdout.write(chalk.green(`enabled "${name}"`) + "\n");
      });
    });

  tools
    .command("disable <name>")
    .description("Disable a tool")
    .action((name: string) => {
      handle(() => {
        setToolEnabled(name, false);
        process.stdout.write(chalk.green(`disabled "${name}"`) + "\n");
      });
    });

  tools
    .command("test <name>")
    .description("Invoke a tool with k=v inputs and print a redacted summary")
    .option("--input <kv...>", "input values as key=value pairs")
    .action((name: string, opts: { input?: string[] }) => {
      handle(async () => {
        const entry: ToolEntry | undefined = getTool(name);
        if (!entry) throw new ToolError(`no such tool: "${name}"`);
        const input = parseKeyValues(opts.input);

        process.stdout.write(chalk.dim(`→ ${entry.method} ${redact(entry.url)}`) + "\n");
        if (Object.keys(input).length > 0) {
          process.stdout.write(chalk.dim(`  input: ${redact(JSON.stringify(input))}`) + "\n");
        }

        const result = await executeTool(entry, input);
        const mark = result.ok ? chalk.green("✓") : chalk.red("✗");
        const status = result.status !== undefined ? ` ${result.status}` : "";
        process.stdout.write(`${mark}${status}\n`);
        if (result.body) {
          process.stdout.write(redact(result.body) + "\n");
        }
      });
    });

  tools
    .command("export")
    .description(
      "Export the tool registry as a JSON array (only auth env-var names are stored, not secrets — safe to share)",
    )
    .option("--file <path>", "write to a file instead of stdout")
    .action((opts: { file?: string }) => {
      handle(() => {
        const entries = listToolEntries();
        const json = JSON.stringify(entries, null, 2);
        if (opts.file) {
          fs.writeFileSync(opts.file, json + "\n", "utf8");
          process.stdout.write(
            chalk.green(`exported ${entries.length} tool(s) to ${opts.file}`) + "\n",
          );
        } else {
          process.stdout.write(json + "\n");
        }
      });
    });

  tools
    .command("import <fileOrUrl>")
    .description("Import tools from a JSON array (local file path or http(s) URL)")
    .option("--overwrite", "replace tools whose name already exists")
    .action((fileOrUrl: string, opts: { overwrite?: boolean }) => {
      handle(async () => {
        const raw = await readSource(fileOrUrl);

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(raw);
        } catch {
          throw new ToolError(`source is not valid JSON: ${fileOrUrl}`);
        }
        if (!Array.isArray(parsedJson)) {
          throw new ToolError("expected a JSON array of tool entries");
        }

        let added = 0;
        let skipped = 0;
        let invalid = 0;

        for (const candidate of parsedJson) {
          const parsed = ToolEntrySchema.safeParse(candidate);
          if (!parsed.success) {
            invalid++;
            continue;
          }
          const entry = parsed.data;
          const exists = getTool(entry.name) !== undefined;
          if (exists && !opts.overwrite) {
            skipped++;
            continue;
          }
          addTool(entry);
          added++;
        }

        process.stdout.write(
          chalk.green(`imported: ${added} added`) +
            chalk.dim(`, ${skipped} skipped, ${invalid} invalid`) +
            "\n",
        );
      });
    });

  return tools;
}

/** Read import source from an http(s) URL (via fetch) or a local file path. */
async function readSource(fileOrUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(fileOrUrl)) {
    const res = await fetch(fileOrUrl);
    if (!res.ok) {
      throw new ToolError(`failed to fetch ${fileOrUrl}: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }
  try {
    return fs.readFileSync(fileOrUrl, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ToolError(`cannot read ${fileOrUrl}: ${message}`);
  }
}
