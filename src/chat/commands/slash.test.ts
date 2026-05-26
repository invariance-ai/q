import { describe, it, expect } from "vitest";
import { parseSlash } from "./slash.js";

describe("parseSlash", () => {
  it("returns null for non-slash input", () => {
    expect(parseSlash("hello there")).toBeNull();
    expect(parseSlash("  what is 2+2")).toBeNull();
    expect(parseSlash("")).toBeNull();
  });

  it("handles /exit and /quit", () => {
    expect(parseSlash("/exit")).toEqual({ kind: "exit" });
    expect(parseSlash("/quit")).toEqual({ kind: "exit" });
    expect(parseSlash("  /EXIT  ")).toEqual({ kind: "exit" });
  });

  it("handles /clear", () => {
    expect(parseSlash("/clear")).toEqual({ kind: "clear" });
  });

  it("handles /help with render text", () => {
    const r = parseSlash("/help");
    expect(r?.kind).toBe("handled");
    if (r?.kind === "handled") expect(r.render).toContain("/model");
  });

  it("handles /tools as a bare handled signal", () => {
    expect(parseSlash("/tools")).toEqual({ kind: "handled" });
  });

  it("parses /model <id>", () => {
    expect(parseSlash("/model gpt-4o")).toEqual({ kind: "setModel", model: "gpt-4o" });
    expect(parseSlash("/model   claude-3-5-sonnet  ")).toEqual({
      kind: "setModel",
      model: "claude-3-5-sonnet",
    });
  });

  it("/model with no id is a usage hint, not a setModel", () => {
    const r = parseSlash("/model");
    expect(r?.kind).toBe("handled");
    if (r?.kind === "handled") expect(r.render).toContain("usage");
  });

  it("parses /flag and /wrong with and without note", () => {
    expect(parseSlash("/flag")).toEqual({ kind: "flag" });
    expect(parseSlash("/wrong")).toEqual({ kind: "flag" });
    expect(parseSlash("/flag the math was off")).toEqual({
      kind: "flag",
      note: "the math was off",
    });
    expect(parseSlash("/wrong wrong tool picked")).toEqual({
      kind: "flag",
      note: "wrong tool picked",
    });
  });

  it("unknown commands are handled with a note", () => {
    const r = parseSlash("/bogus");
    expect(r?.kind).toBe("handled");
    if (r?.kind === "handled") expect(r.render).toContain("unknown");
  });

  it("a lone slash is passthrough", () => {
    expect(parseSlash("/")).toEqual({ kind: "passthrough" });
  });
});
