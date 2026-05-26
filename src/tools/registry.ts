import {
  ToolEntrySchema,
  type ToolEntry,
} from "../config/schema.js";
import { readConfig, writeConfig } from "../config/store.js";
import { ToolError } from "../util/errors.js";

/**
 * Tool registry, backed by the persisted config (config.tools). All mutations
 * round-trip through the config store so they survive process restarts.
 */

export function listToolEntries(): ToolEntry[] {
  return readConfig().tools;
}

export function getTool(name: string): ToolEntry | undefined {
  return readConfig().tools.find((t) => t.name === name);
}

export function addTool(entry: ToolEntry): void {
  const parsed = ToolEntrySchema.safeParse(entry);
  if (!parsed.success) {
    throw new ToolError(`Invalid tool definition: ${parsed.error.message}`);
  }
  const cfg = readConfig();
  const idx = cfg.tools.findIndex((t) => t.name === parsed.data.name);
  if (idx >= 0) {
    cfg.tools[idx] = parsed.data;
  } else {
    cfg.tools.push(parsed.data);
  }
  writeConfig(cfg);
}

export function removeTool(name: string): boolean {
  const cfg = readConfig();
  const before = cfg.tools.length;
  cfg.tools = cfg.tools.filter((t) => t.name !== name);
  if (cfg.tools.length === before) return false;
  writeConfig(cfg);
  return true;
}

export function setToolEnabled(name: string, enabled: boolean): void {
  const cfg = readConfig();
  const tool = cfg.tools.find((t) => t.name === name);
  if (!tool) {
    throw new ToolError(`No such tool: '${name}'.`);
  }
  tool.enabled = enabled;
  writeConfig(cfg);
}

/**
 * Disable a single match pattern on a tool (used by `q flag --disable-pattern`).
 * Returns true if a matching pattern was found and disabled.
 */
export function disablePattern(toolName: string, pattern: string): boolean {
  const cfg = readConfig();
  const tool = cfg.tools.find((t) => t.name === toolName);
  if (!tool) return false;
  let changed = false;
  for (const m of tool.match) {
    if (m.pattern === pattern && m.enabled) {
      m.enabled = false;
      changed = true;
    }
  }
  if (changed) writeConfig(cfg);
  return changed;
}

/**
 * Built-in example tools — a starting catalog so the registry is never an empty
 * blank state. Secret-free: keyed tools reference an env var by name only.
 * `q tools init` scaffolds the ones whose key you already have.
 */
export const EXAMPLE_TOOLS: Record<string, ToolEntry> = {
  // --- No key required (instant, works on a fresh install) ---
  web_fetch: ToolEntrySchema.parse({
    name: "web_fetch",
    description:
      "Fetch the raw contents of a public URL over HTTP GET. Use when the user asks what a specific web page or JSON endpoint returns.",
    url: "{{input.url}}",
    method: "GET",
    input: { url: { type: "string", description: "The absolute URL to fetch.", required: true } },
    match: [],
  }),
  npm: ToolEntrySchema.parse({
    name: "npm",
    description: "Latest version and metadata of an npm package.",
    url: "https://registry.npmjs.org/{{input.pkg}}/latest",
    method: "GET",
    input: { pkg: { type: "string", description: "Package name.", required: true } },
    match: [
      { pattern: "npm package {pkg}", kind: "phrase", enabled: true },
      { pattern: "latest version of {pkg}", kind: "phrase", enabled: true },
    ],
  }),
  // --- Keyed (token referenced by env-var name; never stored) ---
  github: ToolEntrySchema.parse({
    name: "github",
    description: "GitHub repository info — description, stars, open issues, default branch.",
    url: "https://api.github.com/repos/{{input.repo}}",
    method: "GET",
    auth: { type: "bearer", envVar: "GITHUB_TOKEN" },
    input: { repo: { type: "string", description: "owner/name, e.g. facebook/react", required: true } },
    match: [
      { pattern: "github repo {repo}", kind: "phrase", enabled: true },
      { pattern: "repo info for {repo}", kind: "phrase", enabled: true },
    ],
  }),
  vercel: ToolEntrySchema.parse({
    name: "vercel",
    description: "Recent Vercel deployments for an app.",
    url: "https://api.vercel.com/v6/deployments?limit=5&app={{input.app}}",
    method: "GET",
    auth: { type: "bearer", envVar: "VERCEL_TOKEN" },
    input: { app: { type: "string", description: "App/project name.", required: true } },
    match: [
      { pattern: "vercel deployments for {app}", kind: "phrase", enabled: true },
      { pattern: "deploy status for {app}", kind: "phrase", enabled: true },
    ],
  }),
  sentry: ToolEntrySchema.parse({
    name: "sentry",
    description: "Unresolved Sentry issues for a project.",
    url: "https://sentry.io/api/0/projects/{{input.org}}/{{input.project}}/issues/?query=is:unresolved",
    method: "GET",
    auth: { type: "bearer", envVar: "SENTRY_AUTH_TOKEN" },
    input: {
      org: { type: "string", description: "Sentry org slug.", required: true },
      project: { type: "string", description: "Project slug.", required: true },
    },
    match: [{ pattern: "sentry issues for {project}", kind: "phrase", enabled: true }],
  }),
  stripe: ToolEntrySchema.parse({
    name: "stripe",
    description: "Stripe account balance (available and pending).",
    url: "https://api.stripe.com/v1/balance",
    method: "GET",
    auth: { type: "bearer", envVar: "STRIPE_SECRET_KEY" },
    match: [{ pattern: "stripe balance", kind: "phrase", enabled: true }],
  }),
  openweather: ToolEntrySchema.parse({
    name: "openweather",
    description: "Current weather for a city.",
    url: "https://api.openweathermap.org/data/2.5/weather?units=metric&q={{input.city}}&appid={{env.OPENWEATHER_API_KEY}}",
    method: "GET",
    input: { city: { type: "string", description: "City name.", required: true } },
    match: [
      { pattern: "weather in {city}", kind: "phrase", enabled: true },
      { pattern: "weather for {city}", kind: "phrase", enabled: true },
    ],
  }),
};

/**
 * Env vars that indicate a catalog tool is usable now (any one present = ready).
 * An empty list means the tool needs no key. `q tools init` uses this to scaffold
 * only the tools you can actually run.
 */
export const EXAMPLE_DETECT: Record<string, string[]> = {
  web_fetch: [],
  npm: [],
  github: ["GITHUB_TOKEN"],
  vercel: ["VERCEL_TOKEN"],
  sentry: ["SENTRY_AUTH_TOKEN"],
  stripe: ["STRIPE_SECRET_KEY"],
  openweather: ["OPENWEATHER_API_KEY"],
};
