import OpenAI from "openai";
import type {
  Provider,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
} from "./types.js";
import { normalizeProviderError } from "./errors.js";

/**
 * OpenAI adapter via chat.completions streaming. Accumulates tool_call deltas
 * and emits them on finish. Usage is read from the final chunk when available
 * (stream_options.include_usage), else approximated as 0/0.
 */
export function createOpenAIProvider(apiKey: string): Provider {
  const client = new OpenAI({ apiKey });

  return {
    name: "openai",
    async *run(req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = req.tools.map(
        (t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }),
      );

      const messages = toOpenAIMessages(req.system, req.messages);

      try {
        const stream = await client.chat.completions.create(
          {
            model: req.model,
            stream: true,
            stream_options: { include_usage: true },
            messages,
            ...(tools.length > 0 ? { tools } : {}),
          },
          { signal: req.signal },
        );

        // Accumulate tool calls by index.
        const toolAcc = new Map<
          number,
          { id: string; name: string; args: string }
        >();
        let usage: { inputTokens: number; outputTokens: number } = {
          inputTokens: 0,
          outputTokens: 0,
        };

        for await (const chunk of stream) {
          if (chunk.usage) {
            usage = {
              inputTokens: chunk.usage.prompt_tokens ?? 0,
              outputTokens: chunk.usage.completion_tokens ?? 0,
            };
          }
          const choice = chunk.choices[0];
          if (!choice) continue;
          const delta = choice.delta;
          if (delta?.content) {
            yield { type: "text_delta", text: delta.content };
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              let acc = toolAcc.get(idx);
              if (!acc) {
                acc = { id: tc.id ?? "", name: "", args: "" };
                toolAcc.set(idx, acc);
              }
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.name = tc.function.name;
              if (tc.function?.arguments) acc.args += tc.function.arguments;
            }
          }
        }

        // Flush accumulated tool calls.
        for (const acc of toolAcc.values()) {
          if (!acc.name) continue;
          let input: Record<string, unknown> = {};
          if (acc.args.trim().length > 0) {
            try {
              input = JSON.parse(acc.args) as Record<string, unknown>;
            } catch {
              input = {};
            }
          }
          yield {
            type: "tool_use",
            id: acc.id || acc.name,
            name: acc.name,
            input,
          };
        }

        yield { type: "done", usage };
      } catch (err) {
        throw normalizeProviderError(err, "openai");
      }
    },
  };
}

function toOpenAIMessages(
  system: string,
  messages: ProviderMessage[],
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (system.trim().length > 0) {
    out.push({ role: "system", content: system });
  }
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.toolCalls && m.toolCalls.length > 0) {
        out.push({
          role: "assistant",
          content: m.content.length > 0 ? m.content : null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          })),
        });
      } else {
        out.push({ role: "assistant", content: m.content });
      }
    } else {
      out.push({
        role: "tool",
        tool_call_id: m.toolUseId,
        content: m.content,
      });
    }
  }
  return out;
}
