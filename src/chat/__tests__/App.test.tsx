import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../App.js";
import type { QEngine, StreamEvent, AskParams, AskResult } from "../../engine/types.js";

// Tests run with FORCE_COLOR=0/NO_COLOR=1, so frames are already plain; this is
// a defensive stripper in case a terminal still injects escapes.
const ANSI = /\[[0-9;]*m/g;
const stripAnsi = (s: string): string => s.replace(ANSI, "");

/** A scripted mock engine: routed → text_delta×n → done. */
function makeMockEngine(reply = "Hello from q"): QEngine {
  async function* script(params: AskParams): AsyncGenerator<StreamEvent> {
    yield { type: "routed", via: "llm" };
    for (const ch of reply) {
      yield { type: "text_delta", text: ch };
    }
    const result: AskResult = {
      answer: reply,
      model: params.model ?? "gpt-4o-mini",
      provider: "openai",
      usage: { inputTokens: 7, outputTokens: reply.length },
      toolCalls: [],
      routedVia: "llm",
    };
    yield { type: "done", result };
  }
  return {
    stream: (params) => script(params),
    ask: async (params) => {
      for await (const ev of script(params)) {
        if (ev.type === "done") return ev.result;
      }
      throw new Error("no done");
    },
    listModels: () => ["gpt-4o-mini", "claude-3-5-sonnet"],
    listTools: () => [{ name: "nis_score", description: "lookup score" }],
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("<App/>", () => {
  it("renders the branded banner and status bar", () => {
    const { lastFrame } = render(
      <App
        engine={makeMockEngine()}
        initialModel="gpt-4o-mini"
        models={["gpt-4o-mini"]}
        tools={[{ name: "nis_score" }]}
      />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("q");
    expect(frame).toContain("ask anything");
    expect(frame).toContain("gpt-4o-mini");
    // status bar bits
    expect(frame).toContain("abort");
    expect(frame).toContain("exit");
  });

  it("submitting a question renders the user turn and streamed answer", async () => {
    const { lastFrame, stdin } = render(
      <App
        engine={makeMockEngine("Hi there")}
        initialModel="gpt-4o-mini"
        models={["gpt-4o-mini"]}
        tools={[]}
      />,
    );

    stdin.write("hello");
    await wait(20);
    stdin.write("\r");

    // Allow the async generator + coalescing timer to flush.
    let frame = "";
    for (let i = 0; i < 60; i++) {
      await wait(15);
      frame = stripAnsi(lastFrame() ?? "");
      if (frame.includes("Hi there")) break;
    }

    expect(frame).toContain("hello"); // user turn echoed
    expect(frame).toContain("Hi there"); // streamed/committed answer
  });

  it("shows the input placeholder before any input", () => {
    const { lastFrame } = render(
      <App
        engine={makeMockEngine()}
        initialModel="gpt-4o-mini"
        models={["gpt-4o-mini"]}
        tools={[]}
      />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("for commands");
  });
});
