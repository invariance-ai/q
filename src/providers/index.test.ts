import { describe, it, expect } from "vitest";
import { resolveProvider } from "./index.js";
import { ConfigError } from "../util/errors.js";

describe("resolveProvider", () => {
  it("maps claude models to anthropic", () => {
    expect(resolveProvider("claude-opus-4-7")).toBe("anthropic");
    expect(resolveProvider("claude-sonnet-4-6")).toBe("anthropic");
  });

  it("maps gpt + o-series to openai", () => {
    expect(resolveProvider("gpt-4o-mini")).toBe("openai");
    expect(resolveProvider("o4-mini")).toBe("openai");
  });

  it("honors explicit provider prefix", () => {
    expect(resolveProvider("anthropic/some-future-model")).toBe("anthropic");
    expect(resolveProvider("openai/some-future-model")).toBe("openai");
  });

  it("throws on unknown model", () => {
    expect(() => resolveProvider("llama-3")).toThrow(ConfigError);
  });

  it("throws on unknown provider prefix", () => {
    expect(() => resolveProvider("mistral/foo")).toThrow(ConfigError);
  });
});
