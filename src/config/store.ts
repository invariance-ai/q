import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ConfigSchema,
  FeatureFlagsSchema,
  OutputFormatSchema,
  ProviderKeysSchema,
  defaultConfig,
  type Config,
} from "./schema.js";
import { ConfigError } from "../util/errors.js";
import { getEnv } from "../util/env.js";

/** Valid `keys.<provider>` names, derived from the schema so it never drifts. */
const KEY_PROVIDERS = new Set(Object.keys(ProviderKeysSchema.shape));

function assertKeyProvider(sub: string): void {
  if (!KEY_PROVIDERS.has(sub)) {
    throw new ConfigError(
      `Unknown key provider: '${sub}'. Valid: ${[...KEY_PROVIDERS].join(", ")}.`,
    );
  }
}

/**
 * Config store for `q`. Mirrors invariance-cli: atomic temp-rename writes,
 * 0o600 file mode, 0o700 dir mode, env-aware config dir. Stores config.json
 * plus engine sidecars (last.json, feedback.jsonl) in the same directory.
 */

export function getConfigDir(): string {
  const xdg = getEnv("XDG_CONFIG_HOME");
  if (xdg && xdg.trim().length > 0) {
    return path.join(xdg, "q");
  }
  return path.join(os.homedir(), ".config", "q");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function configFileExists(): boolean {
  return fs.existsSync(getConfigPath());
}

function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function readConfig(): Config {
  const file = getConfigPath();
  if (!fs.existsSync(file)) {
    return defaultConfig();
  }
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch (err) {
    throw new ConfigError(
      `Unable to read config at ${file}: ${(err as Error).message}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(`Config file at ${file} is not valid JSON.`);
  }
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(
      `Config file at ${file} is invalid: ${result.error.message}`,
    );
  }
  return result.data;
}

export function writeConfig(cfg: Config): void {
  // Re-validate to guarantee on-disk integrity.
  const validated = ConfigSchema.parse(cfg);
  ensureConfigDir();
  const file = getConfigPath();
  const payload = JSON.stringify(validated, null, 2) + "\n";
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, payload, { mode: 0o600 });
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}

const FEATURE_KEYS = new Set([
  "tools",
  "stream",
  "think",
  "regexPhraseWithLLM",
  "format",
]);

function coerceBoolean(key: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  throw new ConfigError(`Expected a boolean for '${key}', got '${value}'.`);
}

export function getConfigValue(key: string): unknown {
  const cfg = readConfig();
  if (key === "defaultModel") return cfg.defaultModel;
  if (key.startsWith("features.")) {
    const sub = key.slice("features.".length);
    if (!FEATURE_KEYS.has(sub)) {
      throw new ConfigError(`Unknown feature flag: '${sub}'.`);
    }
    return (cfg.features as Record<string, unknown>)[sub];
  }
  if (key.startsWith("keys.")) {
    const sub = key.slice("keys.".length);
    assertKeyProvider(sub);
    return (cfg.keys as Record<string, string | undefined>)[sub];
  }
  throw new ConfigError(
    `Unknown config key: '${key}'. Valid: defaultModel, features.<flag>, keys.<provider>.`,
  );
}

export function setConfigValue(key: string, value: string): void {
  const cfg = readConfig();
  if (key === "defaultModel") {
    cfg.defaultModel = value;
  } else if (key.startsWith("features.")) {
    const sub = key.slice("features.".length);
    if (!FEATURE_KEYS.has(sub)) {
      throw new ConfigError(`Unknown feature flag: '${sub}'.`);
    }
    if (sub === "format") {
      const fmt = OutputFormatSchema.safeParse(value);
      if (!fmt.success) {
        throw new ConfigError(
          `Invalid format '${value}'. Valid: markdown, text, json.`,
        );
      }
      cfg.features.format = fmt.data;
    } else {
      (cfg.features as Record<string, unknown>)[sub] = coerceBoolean(key, value);
    }
    // Re-validate the feature block specifically for clear errors.
    cfg.features = FeatureFlagsSchema.parse(cfg.features);
  } else if (key.startsWith("keys.")) {
    const sub = key.slice("keys.".length);
    assertKeyProvider(sub);
    (cfg.keys as Record<string, string | undefined>)[sub] = value;
  } else {
    throw new ConfigError(
      `Unknown config key: '${key}'. Valid: defaultModel, features.<flag>, keys.<provider>.`,
    );
  }
  writeConfig(cfg);
}

export function clearConfigValue(key?: string): void {
  if (!key) {
    writeConfig(defaultConfig());
    return;
  }
  const cfg = readConfig();
  const def = defaultConfig();
  if (key === "defaultModel") {
    cfg.defaultModel = def.defaultModel;
  } else if (key.startsWith("features.")) {
    const sub = key.slice("features.".length);
    if (!FEATURE_KEYS.has(sub)) {
      throw new ConfigError(`Unknown feature flag: '${sub}'.`);
    }
    (cfg.features as Record<string, unknown>)[sub] = (
      def.features as Record<string, unknown>
    )[sub];
  } else if (key.startsWith("keys.")) {
    const sub = key.slice("keys.".length);
    assertKeyProvider(sub);
    delete (cfg.keys as Record<string, string | undefined>)[sub];
  } else {
    throw new ConfigError(
      `Unknown config key: '${key}'. Valid: defaultModel, features.<flag>, keys.<provider>.`,
    );
  }
  writeConfig(cfg);
}
