import { describe, it, expect } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it("masks a Google API key", () => {
    const out = redact("key=AIzaSyA1234567890abcdefghijklmnopqrstuv done");
    expect(out).not.toContain("AIzaSyA1234567890abcdefghijklmnopqrstuv");
    expect(out).toContain("***");
  });

  it("masks an sk- key", () => {
    const out = redact("use sk-abcdefghijklmnopqrstuvwxyz123456 here");
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(out).toContain("***");
  });

  it("masks a Bearer token but keeps the prefix", () => {
    const out = redact("Authorization: Bearer xyzABC1234567890token");
    expect(out).not.toContain("xyzABC1234567890token");
    expect(out).toContain("Bearer ***");
  });

  it("leaves normal prose untouched", () => {
    const prose = "The quick brown fox jumps over the lazy dog 42 times.";
    expect(redact(prose)).toBe(prose);
  });
});
