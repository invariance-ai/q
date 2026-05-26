import { describe, it, expect } from "vitest";
import { ToolEntrySchema } from "../config/schema.js";
import { compilePattern, matchTools } from "./regex-route.js";

describe("regex-route", () => {
  it("phrase pattern captures a named group", () => {
    const tool = ToolEntrySchema.parse({
      name: "nis",
      description: "NIS score lookup",
      url: "https://api.test/{{input.entity}}",
      input: { entity: { type: "string" } },
      match: [{ pattern: "nis score for {entity}", kind: "phrase" }],
    });
    const m = matchTools("nis score for acme", [tool]);
    expect(m).toBeDefined();
    expect(m?.input["entity"]).toBe("acme");
    expect(m?.tool.name).toBe("nis");
    expect(m?.pattern).toBe("nis score for {entity}");
  });

  it("tolerates trailing punctuation and case", () => {
    const re = compilePattern({
      pattern: "weather in {city}",
      kind: "phrase",
      enabled: true,
    });
    const r = re.exec("Weather in Paris?");
    expect(r?.groups?.["city"]).toBe("Paris");
  });

  it("returns undefined when nothing matches", () => {
    const tool = ToolEntrySchema.parse({
      name: "nis",
      description: "d",
      url: "https://api.test/",
      match: [{ pattern: "nis score for {entity}", kind: "phrase" }],
    });
    expect(matchTools("what is the capital of France", [tool])).toBeUndefined();
  });

  it("falls back to whole question as query when declared", () => {
    const tool = ToolEntrySchema.parse({
      name: "search",
      description: "d",
      url: "https://api.test/",
      input: { query: { type: "string" } },
      match: [{ pattern: "search .*", kind: "regex" }],
    });
    const m = matchTools("search foo bar", [tool]);
    expect(m?.input["query"]).toBe("search foo bar");
  });
});
