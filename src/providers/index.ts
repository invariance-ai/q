import type { ProviderName } from "../engine/types.js";
import type { Provider } from "./types.js";
import { ConfigError } from "../util/errors.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAIProvider } from "./openai.js";

/**
 * Provider registry. Anthropic uses its own SDK; everything else speaks the
 * OpenAI chat-completions API, so we serve them all through the OpenAI adapter
 * with a per-provider base URL. OpenRouter is the universal catch-all: one key
 * proxies models from every provider via the `openrouter/<model>` form.
 */
export interface ProviderSpec {
  /** OpenAI-compatible base URL (undefined = native, i.e. api.openai.com or the Anthropic SDK). */
  baseURL?: string;
  /** Environment variables checked in order for this provider's key. */
  envVars: string[];
  /** Model-id prefixes that route to this provider. */
  prefixes: RegExp[];
}

export const PROVIDERS: Record<ProviderName, ProviderSpec> = {
  anthropic: { envVars: ["ANTHROPIC_API_KEY"], prefixes: [/^(claude|anthropic)/i] },
  openai: { envVars: ["OPENAI_API_KEY"], prefixes: [/^gpt/i, /^o[0-9]/i, /^chatgpt/i] },
  xai: { baseURL: "https://api.x.ai/v1", envVars: ["XAI_API_KEY"], prefixes: [/^grok/i] },
  google: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    envVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    prefixes: [/^gemini/i],
  },
  perplexity: {
    baseURL: "https://api.perplexity.ai",
    envVars: ["PERPLEXITY_API_KEY", "PPLX_API_KEY"],
    prefixes: [/^sonar/i, /^pplx/i],
  },
  groq: { baseURL: "https://api.groq.com/openai/v1", envVars: ["GROQ_API_KEY"], prefixes: [] },
  mistral: {
    baseURL: "https://api.mistral.ai/v1",
    envVars: ["MISTRAL_API_KEY"],
    prefixes: [/^mistral/i, /^codestral/i, /^magistral/i, /^ministral/i],
  },
  deepseek: {
    baseURL: "https://api.deepseek.com",
    envVars: ["DEEPSEEK_API_KEY"],
    prefixes: [/^deepseek/i],
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    envVars: ["OPENROUTER_API_KEY"],
    prefixes: [],
  },
};

export const PROVIDER_NAMES = Object.keys(PROVIDERS) as ProviderName[];

/** Env-var lookup order per provider (used by config resolution). */
export const PROVIDER_ENV_VARS: Record<ProviderName, string[]> = Object.fromEntries(
  PROVIDER_NAMES.map((p) => [p, PROVIDERS[p].envVars]),
) as Record<ProviderName, string[]>;

/** Curated model ids surfaced in `/model` and the status bar. */
export const KNOWN_MODELS: string[] = [
  "gpt-4o-mini",
  "gpt-4o",
  "o4-mini",
  "gpt-4o-mini-search-preview",
  "gpt-4o-search-preview",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "grok-3",
  "grok-2-latest",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "sonar",
  "sonar-pro",
  "deepseek-chat",
  "mistral-large-latest",
];

function isProviderName(s: string): s is ProviderName {
  return (PROVIDER_NAMES as string[]).includes(s);
}

/**
 * Web-search-capable models that have built-in search but do NOT accept
 * function/tool definitions (OpenAI *-search-preview, Perplexity sonar/pplx).
 * The engine sends no tools to these.
 */
export function modelRejectsTools(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.includes("search-preview") || /(^|\/)sonar/.test(id) || id.includes("pplx");
}

/**
 * Map a model id to its provider.
 * - `provider/model` forces a provider (e.g. `openrouter/anthropic/claude-3.5`,
 *   `openai/gpt-4o`). Required for OpenRouter and any model whose name doesn't
 *   prefix-match a known provider.
 * - otherwise match the id against each provider's prefixes.
 */
export function resolveProvider(modelId: string): ProviderName {
  const id = modelId.trim();
  const slash = id.indexOf("/");
  if (slash > 0) {
    const prefix = id.slice(0, slash).toLowerCase();
    if (isProviderName(prefix)) return prefix;
    throw new ConfigError(
      `Unknown provider prefix '${prefix}'. Valid: ${PROVIDER_NAMES.join(", ")}.`,
    );
  }
  for (const name of PROVIDER_NAMES) {
    if (PROVIDERS[name].prefixes.some((re) => re.test(id))) return name;
  }
  throw new ConfigError(
    `Cannot determine a provider for model '${modelId}'. Prefix it, e.g. ` +
      `'openrouter/${modelId}' or 'openai/${modelId}'.`,
  );
}

/** Strip a leading `provider/` so the wire model id is what the API expects. */
function wireModelId(modelId: string): string {
  const slash = modelId.indexOf("/");
  if (slash > 0 && isProviderName(modelId.slice(0, slash).toLowerCase())) {
    return modelId.slice(slash + 1);
  }
  return modelId;
}

export function getProvider(modelId: string, apiKey: string): Provider {
  const provider = resolveProvider(modelId);
  if (provider === "anthropic") return createAnthropicProvider(apiKey);
  const spec = PROVIDERS[provider];
  return createOpenAIProvider(apiKey, {
    ...(spec.baseURL ? { baseURL: spec.baseURL } : {}),
    name: provider,
  });
}

export { wireModelId };
