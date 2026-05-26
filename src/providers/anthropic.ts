import Anthropic from "@anthropic-ai/sdk";
import type {
  Provider,
  ProviderMessage,
  ProviderRequest,
  ProviderStreamEvent,
} from "./types.js";
import { normalizeProviderError } from "./errors.js";

/**
 * Anthropic adapter. Streams raw events for text/thinking/tool_use deltas and
 * reads usage from the assembled final message.
 */
export function createAnthropicProvider(apiKey: string): Provider {
  const client = new Anthropic({ apiKey });

  return {
    name: "anthropic",
    async *run(req: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
      const tools: Anthropic.Tool[] = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      }));

      const messages = toAnthropicMessages(req.messages);

      const params: Anthropic.MessageStreamParams = {
        model: req.model,
        max_tokens: 4096,
        system: req.system,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
        ...(req.think ? { thinking: { type: "adaptive" } } : {}),
      };

      try {
        const stream = client.messages.stream(params, { signal: req.signal });

        // Track in-progress tool_use blocks by content index.
        const toolBlocks = new Map<
          number,
          { id: string; name: string; json: string }
        >();

        for await (const event of stream) {
          if (event.type === "content_block_start") {
            const block = event.content_block;
            if (block.type === "tool_use") {
              toolBlocks.set(event.index, {
                id: block.id,
                name: block.name,
                json: "",
              });
            }
          } else if (event.type === "content_block_delta") {
            const delta = event.delta;
            if (delta.type === "text_delta") {
              yield { type: "text_delta", text: delta.text };
            } else if (delta.type === "thinking_delta") {
              yield { type: "thinking_delta", text: delta.thinking };
            } else if (delta.type === "input_json_delta") {
              const tb = toolBlocks.get(event.index);
              if (tb) tb.json += delta.partial_json;
            }
          } else if (event.type === "content_block_stop") {
            const tb = toolBlocks.get(event.index);
            if (tb) {
              let input: Record<string, unknown> = {};
              if (tb.json.trim().length > 0) {
                try {
                  input = JSON.parse(tb.json) as Record<string, unknown>;
                } catch {
                  input = {};
                }
              }
              yield { type: "tool_use", id: tb.id, name: tb.name, input };
              toolBlocks.delete(event.index);
            }
          }
        }

        const final = await stream.finalMessage();
        yield {
          type: "done",
          usage: {
            inputTokens: final.usage.input_tokens,
            outputTokens: final.usage.output_tokens,
          },
        };
      } catch (err) {
        throw normalizeProviderError(err, "anthropic");
      }
    },
  };
}

function toAnthropicMessages(
  messages: ProviderMessage[],
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.toolCalls && m.toolCalls.length > 0) {
        const blocks: Anthropic.ContentBlockParam[] = [];
        if (m.content.trim().length > 0) {
          blocks.push({ type: "text", text: m.content });
        }
        for (const tc of m.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
        out.push({ role: "assistant", content: blocks });
      } else {
        out.push({ role: "assistant", content: m.content });
      }
    } else {
      // tool result -> user message with a tool_result block
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolUseId,
            content: m.content,
          },
        ],
      });
    }
  }
  return out;
}
