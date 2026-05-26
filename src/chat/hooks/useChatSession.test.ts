import { describe, it, expect } from "vitest";
import { chatReducer, initialChatState, type ChatState } from "./useChatSession.js";

function drive(state: ChatState, actions: Parameters<typeof chatReducer>[1][]): ChatState {
  return actions.reduce((s, a) => chatReducer(s, a), state);
}

describe("chatReducer", () => {
  it("SUBMIT pushes a user turn and enters thinking", () => {
    const s = chatReducer(initialChatState("gpt-4o-mini"), {
      type: "SUBMIT",
      question: "hello",
    });
    expect(s.phase).toBe("thinking");
    expect(s.history).toEqual([{ role: "user", content: "hello" }]);
    expect(s.streamingBuffer).toBe("");
  });

  it("SUBMIT → TOKEN×n → DONE commits an assistant turn and returns to idle", () => {
    const final = drive(initialChatState("gpt-4o-mini"), [
      { type: "SUBMIT", question: "hi" },
      { type: "ROUTED", via: "llm" },
      { type: "TOKEN", text: "Hel" },
      { type: "TOKEN", text: "lo " },
      { type: "TOKEN", text: "world" },
      { type: "DONE" },
    ]);
    expect(final.phase).toBe("idle");
    expect(final.streamingBuffer).toBe("");
    expect(final.history).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello world" },
    ]);
  });

  it("first TOKEN flips thinking to streaming", () => {
    const s = drive(initialChatState("m"), [
      { type: "SUBMIT", question: "q" },
      { type: "TOKEN", text: "a" },
    ]);
    expect(s.phase).toBe("streaming");
  });

  it("TOOL_CALL then TOOL_RESULT updates the tool log", () => {
    const s = drive(initialChatState("m"), [
      { type: "SUBMIT", question: "q" },
      { type: "TOOL_CALL", tool: "nis_score" },
    ]);
    expect(s.phase).toBe("tool");
    expect(s.activeTool).toBe("nis_score");
    expect(s.toolLog).toEqual([{ name: "nis_score", done: false }]);

    const after = chatReducer(s, {
      type: "TOOL_RESULT",
      record: {
        tool: "nis_score",
        input: {},
        ok: true,
        durationMs: 5,
      },
    });
    expect(after.activeTool).toBeNull();
    expect(after.phase).toBe("thinking");
    expect(after.toolLog).toEqual([{ name: "nis_score", done: true }]);
  });

  it("ABORT commits any partial buffer and goes idle", () => {
    const s = drive(initialChatState("m"), [
      { type: "SUBMIT", question: "q" },
      { type: "TOKEN", text: "partial" },
      { type: "ABORT" },
    ]);
    expect(s.phase).toBe("idle");
    expect(s.history.at(-1)).toEqual({ role: "assistant", content: "partial" });
  });

  it("DONE with no buffer does not append an empty assistant turn", () => {
    const s = drive(initialChatState("m"), [
      { type: "SUBMIT", question: "q" },
      { type: "DONE" },
    ]);
    expect(s.history).toEqual([{ role: "user", content: "q" }]);
  });

  it("ERROR records the message and resets phase", () => {
    const s = drive(initialChatState("m"), [
      { type: "SUBMIT", question: "q" },
      { type: "ERROR", error: "boom" },
    ]);
    expect(s.phase).toBe("idle");
    expect(s.error).toBe("boom");
  });

  it("SET_MODEL updates only the model", () => {
    const s = chatReducer(initialChatState("a"), { type: "SET_MODEL", model: "b" });
    expect(s.model).toBe("b");
  });

  it("defaults think to false and TOGGLE_THINK flips it", () => {
    const init = initialChatState("m");
    expect(init.think).toBe(false);
    const on = chatReducer(init, { type: "TOGGLE_THINK" });
    expect(on.think).toBe(true);
    const off = chatReducer(on, { type: "TOGGLE_THINK" });
    expect(off.think).toBe(false);
  });

  it("CLEAR preserves the think preference", () => {
    const s = drive(initialChatState("m"), [
      { type: "TOGGLE_THINK" },
      { type: "SUBMIT", question: "q" },
      { type: "TOKEN", text: "x" },
      { type: "DONE" },
      { type: "CLEAR" },
    ]);
    expect(s.history).toEqual([]);
    expect(s.think).toBe(true);
  });

  it("CLEAR resets history but keeps the model", () => {
    const s = drive(initialChatState("keep-me"), [
      { type: "SUBMIT", question: "q" },
      { type: "TOKEN", text: "x" },
      { type: "DONE" },
      { type: "CLEAR" },
    ]);
    expect(s.history).toEqual([]);
    expect(s.model).toBe("keep-me");
    expect(s.phase).toBe("idle");
  });

  it("DONE records usage from the result", () => {
    const s = drive(initialChatState("m"), [
      { type: "SUBMIT", question: "q" },
      { type: "TOKEN", text: "hi" },
      {
        type: "DONE",
        result: {
          answer: "hi",
          model: "m",
          provider: "openai",
          usage: { inputTokens: 10, outputTokens: 3 },
          toolCalls: [],
          routedVia: "llm",
        },
      },
    ]);
    expect(s.usage).toEqual({ inputTokens: 10, outputTokens: 3 });
  });
});
