import { describe, it, expect } from "vitest";
import { EXAMPLE_TOOLS, EXAMPLE_DETECT } from "./registry.js";

describe("example catalog", () => {
  it("every detect entry maps to a real catalog tool", () => {
    for (const name of Object.keys(EXAMPLE_DETECT)) {
      expect(EXAMPLE_TOOLS[name], `missing tool for detect entry ${name}`).toBeDefined();
    }
  });

  it("ships no-key tools (empty detect) so a fresh install has instant value", () => {
    expect(EXAMPLE_DETECT["web_fetch"]).toEqual([]);
    expect(EXAMPLE_DETECT["npm"]).toEqual([]);
  });

  it("every catalog tool is a valid ToolEntry whose name matches its key", () => {
    for (const [name, entry] of Object.entries(EXAMPLE_TOOLS)) {
      expect(entry.name).toBe(name);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});
