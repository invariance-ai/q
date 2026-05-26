import { describe, it, expect } from "vitest";

import { renderAnswer, formatToolEvent } from "./output.js";
import type { AskResult, StreamEvent, ToolCallRecord } from "../engine/types.js";

const baseResult: AskResult = {
  answer: "Hello **world** and `code`",
  model: "gpt-4o-mini",
  provider: "openai",
  usage: { inputTokens: 10, outputTokens: 5 },
  toolCalls: [],
  routedVia: "llm",
};

describe("renderAnswer", () => {
  it("json format returns the full pretty-printed result", () => {
    const out = renderAnswer(baseResult, { format: "json" });
    expect(out).toBe(JSON.stringify(baseResult, null, 2));
    expect(JSON.parse(out).model).toBe("gpt-4o-mini");
  });

  it("text format returns the raw answer verbatim", () => {
    const out = renderAnswer(baseResult, { format: "text" });
    expect(out).toBe("Hello **world** and `code`");
  });

  it("markdown format strips markdown syntax markers", () => {
    // Color is disabled in tests (FORCE_COLOR=0), so the **/` markers are gone
    // but their inner text survives.
    const out = renderAnswer(baseResult, { format: "markdown" });
    expect(out).toContain("world");
    expect(out).toContain("code");
    expect(out).not.toContain("**");
    expect(out).not.toContain("`");
  });

  it("markdown renders headers and bullets", () => {
    const result: AskResult = { ...baseResult, answer: "# Title\n- one\n- two" };
    const out = renderAnswer(result, { format: "markdown" });
    expect(out).toContain("Title");
    expect(out).toContain("one");
    expect(out).toContain("two");
    expect(out).not.toContain("# Title");
    expect(out).toContain("•");
  });
});

describe("formatToolEvent", () => {
  it("formats tool_call_start", () => {
    const e: StreamEvent = { type: "tool_call_start", tool: "nis_score", input: {} };
    expect(formatToolEvent(e)).toContain("→ calling tool: nis_score");
  });

  it("formats a successful tool_call_end with status", () => {
    const record: ToolCallRecord = {
      tool: "nis_score",
      input: {},
      ok: true,
      status: 200,
      durationMs: 42,
    };
    const out = formatToolEvent({ type: "tool_call_end", record });
    expect(out).toContain("✓ nis_score");
    expect(out).toContain("(200)");
  });

  it("formats a failed tool_call_end", () => {
    const record: ToolCallRecord = {
      tool: "nis_score",
      input: {},
      ok: false,
      durationMs: 10,
    };
    const out = formatToolEvent({ type: "tool_call_end", record });
    expect(out).toContain("✗ nis_score");
  });

  it("formats a regex routed event with the matched pattern", () => {
    const e: StreamEvent = { type: "routed", via: "regex", pattern: "nis score for {entity}" };
    expect(formatToolEvent(e)).toContain("→ matched: nis score for {entity}");
  });

  it("formats an llm routed event", () => {
    const e: StreamEvent = { type: "routed", via: "llm" };
    expect(formatToolEvent(e)).toContain("→ routed: llm");
  });

  it("returns undefined for text/done/error/thinking events", () => {
    expect(formatToolEvent({ type: "text_delta", text: "hi" })).toBeUndefined();
    expect(formatToolEvent({ type: "thinking_delta", text: "hmm" })).toBeUndefined();
    expect(formatToolEvent({ type: "done", result: baseResult })).toBeUndefined();
    expect(formatToolEvent({ type: "error", error: "boom" })).toBeUndefined();
  });
});
