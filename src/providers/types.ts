import type { ProviderName, Usage } from "../engine/types.js";

/**
 * Provider abstraction: a normalized request/stream shape both the Anthropic
 * and OpenAI adapters map to and from. The engine never touches vendor SDKs
 * directly.
 */

/** A tool the provider may call, as a JSON-schema object. */
export interface ProviderToolSpec {
  name: string;
  description: string;
  /** JSON-schema object describing the tool's input. */
  parameters: Record<string, unknown>;
}

/** A tool call emitted by the assistant in a prior turn (for replay). */
export interface ProviderToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Normalized conversation turn. */
export type ProviderMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      /** Tool calls the assistant made on this turn, if any. */
      toolCalls?: ProviderToolCall[];
    }
  | { role: "tool"; toolUseId: string; toolName: string; content: string };

export type ProviderStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "done"; usage: Usage };

export interface ProviderRequest {
  model: string;
  system: string;
  messages: ProviderMessage[];
  tools: ProviderToolSpec[];
  think: boolean;
  signal?: AbortSignal;
}

export interface Provider {
  name: ProviderName;
  run(req: ProviderRequest): AsyncIterable<ProviderStreamEvent>;
}
