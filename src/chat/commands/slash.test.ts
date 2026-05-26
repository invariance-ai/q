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

  it("handles /clear and /new as a fresh conversation", () => {
    expect(parseSlash("/clear")).toEqual({ kind: "new" });
    expect(parseSlash("/new")).toEqual({ kind: "new" });
  });

  it("handles /sessions", () => {
    expect(parseSlash("/sessions")).toEqual({ kind: "sessions" });
  });

  it("handles /retry", () => {
    expect(parseSlash("/retry")).toEqual({ kind: "retry" });
  });

  it("handles /think as a toggle", () => {
    expect(parseSlash("/think")).toEqual({ kind: "toggleThink" });
  });

  it("handles /help with render text listing the full command set", () => {
    const r = parseSlash("/help");
    expect(r?.kind).toBe("handled");
    if (r?.kind === "handled") {
      for (const c of ["/model", "/tools", "/sessions", "/new", "/retry", "/think"]) {
        expect(r.render).toContain(c);
      }
    }
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

  it("/model with no id lists models, not a setModel", () => {
    expect(parseSlash("/model")).toEqual({ kind: "listModels" });
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
