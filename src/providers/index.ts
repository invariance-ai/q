import type { ProviderName } from "../engine/types.js";
import type { Provider } from "./types.js";
import { ConfigError } from "../util/errors.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAIProvider } from "./openai.js";

/** Curated, well-known model ids surfaced in `/model` and the status bar. */
export const KNOWN_MODELS: string[] = [
  "gpt-4o-mini",
  "gpt-4o",
  "o4-mini",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];

/**
 * Map a model id to its provider.
 * - `provider/model` prefix forces the provider explicitly.
 * - `claude*`/`anthropic*` -> anthropic.
 * - `gpt*`/`o<digit>*` -> openai.
 * - otherwise throw ConfigError.
 */
export function resolveProvider(modelId: string): ProviderName {
  const id = modelId.trim();
  const slash = id.indexOf("/");
  if (slash > 0) {
    const prefix = id.slice(0, slash).toLowerCase();
    if (prefix === "anthropic") return "anthropic";
    if (prefix === "openai") return "openai";
    throw new ConfigError(
      `Unknown provider prefix '${prefix}'. Use 'anthropic/...' or 'openai/...'.`,
    );
  }
  if (/^(claude|anthropic)/i.test(id)) return "anthropic";
  if (/^(gpt|o[0-9])/i.test(id)) return "openai";
  throw new ConfigError(
    `Cannot determine provider for model '${modelId}'. Prefix it with 'anthropic/' or 'openai/'.`,
  );
}

export function getProvider(modelId: string, apiKey: string): Provider {
  const provider = resolveProvider(modelId);
  if (provider === "anthropic") return createAnthropicProvider(apiKey);
  return createOpenAIProvider(apiKey);
}
