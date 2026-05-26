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

/** Generic, secret-free example tools users can install as a starting point. */
export const EXAMPLE_TOOLS: Record<string, ToolEntry> = {
  web_fetch: ToolEntrySchema.parse({
    name: "web_fetch",
    description:
      "Fetch the raw contents of a public URL over HTTP GET. Use when the user asks what a specific web page or JSON endpoint returns.",
    url: "{{input.url}}",
    method: "GET",
    input: {
      url: {
        type: "string",
        description: "The absolute URL to fetch.",
        required: true,
      },
    },
    match: [],
    timeoutMs: 15000,
  }),
};
