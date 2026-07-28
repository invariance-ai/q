import { describe, it, expect } from "vitest";
import { joinQuery, looksLikeSentence, detectGlobRisk } from "./argv.js";

describe("joinQuery", () => {
  it("joins words with single spaces and trims", () => {
    expect(joinQuery(["deploy", "status", "for", "checkout"])).toBe("deploy status for checkout");
  });

  it("collapses whitespace inside tokens", () => {
    expect(joinQuery(["  whats", "the\tdate  "])).toBe("whats the date");
  });

  it("returns an empty string for no words", () => {
    expect(joinQuery([])).toBe("");
  });
});

describe("looksLikeSentence", () => {
  it("is true for anything ending in a question mark", () => {
    expect(looksLikeSentence("why?")).toBe(true);
  });

  it("is true for multiple words", () => {
    expect(looksLikeSentence("explain promise.allSettled")).toBe(true);
  });

  it("is false for a single bare keyword", () => {
    expect(looksLikeSentence("  chat  ")).toBe(false);
  });
});

describe("detectGlobRisk", () => {
  it("flags unescaped glob metacharacters", () => {
    expect(detectGlobRisk(["how", "does", "this", "work?"])).toBe(true);
    expect(detectGlobRisk(["list", "*.ts"])).toBe(true);
    expect(detectGlobRisk(["[draft]"])).toBe(true);
  });

  it("ignores metacharacters escaped with a backslash", () => {
    expect(detectGlobRisk(["work\\?"])).toBe(false);
  });

  it("is false for plain words", () => {
    expect(detectGlobRisk(["deploy", "status"])).toBe(false);
  });
});
