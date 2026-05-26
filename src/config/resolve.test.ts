import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveApiKey, resolveModel, resolveFeatures } from "./resolve.js";
import { defaultConfig } from "./schema.js";

describe("resolve", () => {
  const saved = {
    ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
    OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
  };

  beforeEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
  });

  afterEach(() => {
    if (saved.ANTHROPIC_API_KEY === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = saved.ANTHROPIC_API_KEY;
    if (saved.OPENAI_API_KEY === undefined) delete process.env["OPENAI_API_KEY"];
    else process.env["OPENAI_API_KEY"] = saved.OPENAI_API_KEY;
  });

  it("env wins over config for anthropic", () => {
    const cfg = defaultConfig();
    cfg.keys.anthropic = "from-file";
    process.env["ANTHROPIC_API_KEY"] = "from-env";
    expect(resolveApiKey("anthropic", cfg)).toBe("from-env");
  });

  it("falls back to config when env unset", () => {
    const cfg = defaultConfig();
    cfg.keys.openai = "from-file";
    expect(resolveApiKey("openai", cfg)).toBe("from-file");
  });

  it("returns undefined when neither set", () => {
    expect(resolveApiKey("anthropic", defaultConfig())).toBeUndefined();
  });

  it("flag model overrides default", () => {
    expect(resolveModel("gpt-4o", defaultConfig())).toBe("gpt-4o");
  });

  it("uses config default model when no flag", () => {
    const cfg = defaultConfig();
    cfg.defaultModel = "claude-opus-4-7";
    expect(resolveModel(undefined, cfg)).toBe("claude-opus-4-7");
  });

  it("applies feature overrides ignoring undefined", () => {
    const cfg = defaultConfig();
    const f = resolveFeatures({ tools: false, think: undefined }, cfg);
    expect(f.tools).toBe(false);
    expect(f.think).toBe(cfg.features.think);
  });
});
