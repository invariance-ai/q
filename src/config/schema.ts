import { z } from "zod";

/**
 * Frozen configuration + tool-registry schemas for `q`.
 *
 * This module is a load-bearing contract: the engine, CLI, tools, and chat UI
 * all import the inferred types from here. Change deliberately.
 */

export const DEFAULT_MODEL = "gpt-4o-mini";

/** A tool `url` may be an absolute URL or contain a `{{template}}` placeholder
 * (e.g. web_fetch's `{{input.url}}`), so we can't use a strict URL validator. */
function isUrlOrTemplate(s: string): boolean {
  if (s.includes("{{")) return true;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

/** How a registered tool authenticates. We store only the env var name that
 * holds the secret — never the secret itself. */
export const ToolAuthSchema = z.object({
  type: z.enum(["bearer", "header"]),
  /** Name of the environment variable holding the token, e.g. "NIS_API_TOKEN". */
  envVar: z.string().min(1),
  /** Header name for type:"header" (default "Authorization"). */
  headerName: z.string().optional(),
});
export type ToolAuth = z.infer<typeof ToolAuthSchema>;

/**
 * A single fast-path match pattern for a tool.
 *
 * - kind:"phrase" — a natural example like "nis score for {entity}" or
 *   "i love to go {place} today". `{name}` placeholders become named capture
 *   groups; surrounding text matches case-insensitively, with collapsed
 *   whitespace and tolerance for trailing punctuation.
 * - kind:"regex" — a raw regular expression (named groups map to tool input).
 */
export const ToolMatchSchema = z.object({
  pattern: z.string().min(1),
  kind: z.enum(["phrase", "regex"]).default("phrase"),
  /** Optional explicit input-key mapping; defaults to the capture-group names. */
  input: z.record(z.string(), z.string()).optional(),
  /** Allow disabling a single pattern (used by `q flag --disable-pattern`). */
  enabled: z.boolean().default(true),
});
export type ToolMatch = z.infer<typeof ToolMatchSchema>;

/** A typed input parameter the LLM (or a matched pattern) can fill. */
export const ToolInputParamSchema = z.object({
  type: z.enum(["string", "number", "boolean"]).default("string"),
  description: z.string().optional(),
  required: z.boolean().default(false),
});
export type ToolInputParam = z.infer<typeof ToolInputParamSchema>;

/** A user-registered HTTP endpoint the LLM may call as a tool. */
export const ToolEntrySchema = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/, "use lowercase letters, digits, underscores"),
  /** "When to use this tool" — the primary signal for LLM routing. */
  description: z.string().min(1),
  url: z.string().min(1).refine(isUrlOrTemplate, "must be an absolute URL or a {{template}}"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  /** Header values may contain {{input.x}} / {{env.X}} templates. */
  headers: z.record(z.string(), z.string()).default({}),
  /** Templated query params. */
  query: z.record(z.string(), z.string()).optional(),
  /** Templated request body (JSON string) for POST/PUT/PATCH. */
  body: z.string().optional(),
  auth: ToolAuthSchema.optional(),
  /** Typed input contract exposed to the LLM and validated before calling. */
  input: z.record(z.string(), ToolInputParamSchema).optional(),
  /** Regex/phrase fast-path patterns. If one matches, route directly. */
  match: z.array(ToolMatchSchema).default([]),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().positive().max(120_000).default(15_000),
});
export type ToolEntry = z.infer<typeof ToolEntrySchema>;

export const OutputFormatSchema = z.enum(["markdown", "text", "json"]);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const FeatureFlagsSchema = z.object({
  /** Master switch for tool-calling. */
  tools: z.boolean().default(true),
  /** Stream tokens as they arrive (one-shot + chat). */
  stream: z.boolean().default(true),
  /** Extended thinking / reasoning. */
  think: z.boolean().default(false),
  /** After a regex fast-path hit, pass the tool result through the LLM to phrase it. */
  regexPhraseWithLLM: z.boolean().default(true),
  format: OutputFormatSchema.default("markdown"),
});
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export const ProviderKeysSchema = z.object({
  anthropic: z.string().optional(),
  openai: z.string().optional(),
});
export type ProviderKeys = z.infer<typeof ProviderKeysSchema>;

export const ConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    defaultModel: z.string().default(DEFAULT_MODEL),
    features: FeatureFlagsSchema.prefault({}),
    tools: z.array(ToolEntrySchema).default([]),
    /**
     * API keys MAY live here, but environment variables always win and we never
     * write env-sourced keys back to disk implicitly.
     */
    keys: ProviderKeysSchema.default({}),
  })
  .strict();
export type Config = z.infer<typeof ConfigSchema>;

/** A default, valid config (used when no file exists yet). */
export function defaultConfig(): Config {
  return ConfigSchema.parse({});
}
