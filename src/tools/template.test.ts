import { describe, it, expect } from "vitest";
import { interpolate } from "./template.js";

describe("interpolate", () => {
  it("substitutes input and env tokens", () => {
    const out = interpolate("https://x/{{input.id}}?k={{env.MY_KEY}}", {
      input: { id: "42" },
      env: { MY_KEY: "abc" },
    });
    expect(out).toBe("https://x/42?k=abc");
  });

  it("replaces missing values with empty string", () => {
    const out = interpolate("{{input.missing}}/{{env.NOPE}}", {
      input: {},
      env: {},
    });
    expect(out).toBe("/");
  });

  it("tolerates surrounding whitespace in tokens", () => {
    expect(interpolate("{{ input.x }}", { input: { x: "y" }, env: {} })).toBe(
      "y",
    );
  });

  it("does not execute anything", () => {
    const out = interpolate("{{input.q}}", {
      input: { q: "${process.exit(1)}" },
      env: {},
    });
    expect(out).toBe("${process.exit(1)}");
  });
});
