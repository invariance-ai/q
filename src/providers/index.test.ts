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

  it("maps the other providers by prefix", () => {
    expect(resolveProvider("grok-3")).toBe("xai");
    expect(resolveProvider("gemini-2.0-flash")).toBe("google");
    expect(resolveProvider("sonar-pro")).toBe("perplexity");
    expect(resolveProvider("deepseek-chat")).toBe("deepseek");
    expect(resolveProvider("mistral-large-latest")).toBe("mistral");
  });

  it("honors explicit provider prefix (incl. openrouter catch-all)", () => {
    expect(resolveProvider("anthropic/some-future-model")).toBe("anthropic");
    expect(resolveProvider("openai/some-future-model")).toBe("openai");
    expect(resolveProvider("openrouter/anthropic/claude-3.5")).toBe("openrouter");
    expect(resolveProvider("groq/llama-3.3-70b")).toBe("groq");
  });

  it("throws on a model with no recognizable provider", () => {
    expect(() => resolveProvider("llama-3")).toThrow(ConfigError);
  });

  it("throws on an unknown explicit provider prefix", () => {
    expect(() => resolveProvider("bogusprovider/foo")).toThrow(ConfigError);
  });
});
