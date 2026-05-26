import type { ToolEntry } from "../config/schema.js";
import type { StreamEvent, ToolCallRecord, Turn, Usage } from "./types.js";
import type {
  Provider,
  ProviderMessage,
  ProviderToolCall,
  ProviderToolSpec,
} from "../providers/types.js";
import { executeTool, toToolCallRecord } from "../tools/execute.js";

export const MAX_TOOL_ROUNDS = 6;

export interface LoopArgs {
  provider: Provider;
  model: string;
  system: string;
  question: string;
  history: Turn[];
  tools: ToolEntry[];
  toolSpecs: ProviderToolSpec[];
  think: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface LoopOutcome {
  answer: string;
  usage: Usage;
  toolCalls: ToolCallRecord[];
}

/**
 * The provider-agnostic tool-calling loop. Yields normalized StreamEvents and
 * returns the assembled answer, accumulated usage, and tool-call records.
 */
export async function* runLoop(
  args: LoopArgs,
): AsyncGenerator<StreamEvent, LoopOutcome, void> {
  const toolByName = new Map(args.tools.map((t) => [t.name, t]));
  const messages: ProviderMessage[] = [];
  for (const turn of args.history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: args.question });

  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const toolCalls: ToolCallRecord[] = [];
  let finalAnswer = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let roundText = "";
    const pendingCalls: ProviderToolCall[] = [];

    const stream = args.provider.run({
      model: args.model,
      system: args.system,
      messages,
      tools: args.toolSpecs,
      think: args.think,
      ...(args.signal ? { signal: args.signal } : {}),
    });

    for await (const ev of stream) {
      if (ev.type === "text_delta") {
        roundText += ev.text;
        yield { type: "text_delta", text: ev.text };
      } else if (ev.type === "thinking_delta") {
        yield { type: "thinking_delta", text: ev.text };
      } else if (ev.type === "tool_use") {
        pendingCalls.push({ id: ev.id, name: ev.name, input: ev.input });
      } else if (ev.type === "done") {
        usage.inputTokens += ev.usage.inputTokens;
        usage.outputTokens += ev.usage.outputTokens;
      }
    }

    if (pendingCalls.length === 0) {
      // No tools requested -> this is the final answer.
      finalAnswer = roundText;
      break;
    }

    // Record the assistant turn (text + tool calls) for the next request.
    messages.push({
      role: "assistant",
      content: roundText,
      toolCalls: pendingCalls,
    });

    // Execute each requested tool and append results.
    for (const call of pendingCalls) {
      const entry = toolByName.get(call.name);
      yield { type: "tool_call_start", tool: call.name, input: call.input };

      if (!entry) {
        const record: ToolCallRecord = {
          tool: call.name,
          input: call.input,
          ok: false,
          durationMs: 0,
          error: `Unknown tool '${call.name}'.`,
        };
        toolCalls.push(record);
        yield { type: "tool_call_end", record };
        messages.push({
          role: "tool",
          toolUseId: call.id,
          toolName: call.name,
          content: `Error: unknown tool '${call.name}'.`,
        });
        continue;
      }

      const start = Date.now();
      const result = await executeTool(entry, call.input, {
        ...(args.signal ? { signal: args.signal } : {}),
        ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
      });
      const record = toToolCallRecord({
        tool: call.name,
        input: call.input,
        result,
        durationMs: Date.now() - start,
      });
      toolCalls.push(record);
      yield { type: "tool_call_end", record };

      messages.push({
        role: "tool",
        toolUseId: call.id,
        toolName: call.name,
        content: result.body,
      });
    }

    if (round === MAX_TOOL_ROUNDS - 1) {
      // Hit the cap with tools still pending; use whatever text we have.
      finalAnswer = roundText;
    }
  }

  return { answer: finalAnswer, usage, toolCalls };
}
