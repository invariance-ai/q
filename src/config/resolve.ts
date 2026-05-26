import type { Config, FeatureFlags } from "./schema.js";
import type { ProviderName } from "../engine/types.js";
import { readConfig } from "./store.js";
import { getEnv } from "../util/env.js";
import { PROVIDER_ENV_VARS } from "../providers/index.js";

/**
 * Resolution helpers layering env over file config. Env always wins and is
 * never written back to disk.
 */

function cfgOrRead(config?: Config): Config {
  return config ?? readConfig();
}

export function resolveApiKey(
  provider: ProviderName,
  config?: Config,
): string | undefined {
  const cfg = cfgOrRead(config);
  // Env vars (in the provider's preferred order) always win, then the config file.
  for (const envVar of PROVIDER_ENV_VARS[provider] ?? []) {
    const val = getEnv(envVar);
    if (val) return val;
  }
  return (cfg.keys as Record<string, string | undefined>)[provider];
}

export function resolveModel(flagModel?: string, config?: Config): string {
  const cfg = cfgOrRead(config);
  return flagModel ?? cfg.defaultModel;
}

export function resolveFeatures(
  overrides?: Partial<FeatureFlags>,
  config?: Config,
): FeatureFlags {
  const cfg = cfgOrRead(config);
  const base: FeatureFlags = { ...cfg.features };
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) {
        (base as Record<string, unknown>)[k] = v;
      }
    }
  }
  return base;
}
