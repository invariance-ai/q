import type { Config, OutputFormat } from "../config/schema.js";

/**
 * Frozen engine contract — the single reconciliation point between the core
 * engine, the one-shot CLI, and the Ink chat UI. Everything streams through
 * `QEngine.stream`; `ask` is a convenience wrapper that drains it.
 */

export type Role = "user" | "assistant";
export interface Turn {
  role: Role;
  content: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type ProviderName =
  | "anthropic"
  | "openai"
  | "xai"
  | "google"
  | "perplexity"
  | "groq"
  | "mistral"
  | "deepseek"
  | "openrouter";

/** Record of one tool invocation (redacted previews only). */
export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  status?: number;
  durationMs: number;
  /** Redacted + truncated preview of the response body. */
  resultPreview?: string;
  error?: string;
}

export interface AskParams {
  question: string;
  /** Overrides config.defaultModel. */
  model?: string;
  /** Override the tool-calling feature for this call. */
  tools?: boolean;
  /** Override extended thinking for this call. */
  think?: boolean;
  /** Prior turns for multi-turn conversations (chat owns this state). */
  history?: Turn[];
  format?: OutputFormat;
  /** Cancellation — Ctrl+C in chat aborts mid-stream. */
  signal?: AbortSignal;
  /** Render the prompt + planned calls without hitting the network. */
  dryRun?: boolean;
  /** Override regex-fast-path LLM phrasing for this call. */
  phrase?: boolean;
  /** Force (true) or disable (false) the web-search model for this call. */
  web?: boolean;
}

export interface DryRunInfo {
  system: string;
  messages: unknown[];
  tools: string[];
}

export interface AskResult {
  answer: string;
  model: string;
  provider: ProviderName;
  usage: Usage;
  toolCalls: ToolCallRecord[];
  /** Which routing path produced the answer. */
  routedVia: "llm" | "regex";
  /**
   * Set when the answer is NOT trustworthy because a tool call failed (HTTP
   * error, blocked SSRF target, timeout). Agents/scripts should treat a present
   * `error` (and the non-zero CLI exit) as "no real answer", not relay `answer`.
   */
  error?: string;
  /** Populated when the regex fast-path matched (for the "→ matched" indicator and `q flag`). */
  matchedPattern?: string;
  matchedTool?: string;
  dryRun?: DryRunInfo;
}

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_call_start"; tool: string; input: Record<string, unknown> }
  | { type: "tool_call_end"; record: ToolCallRecord }
  | { type: "routed"; via: "llm" | "regex"; pattern?: string; tool?: string }
  | { type: "done"; result: AskResult }
  | { type: "error"; error: string };

export interface QEngine {
  ask(params: AskParams): Promise<AskResult>;
  stream(params: AskParams): AsyncIterable<StreamEvent>;
  /** Known model ids (for `/model` validation + status bar). */
  listModels(): string[];
  /** Registered tools (for `/tools` + the "N tools" indicator). */
  listTools(): { name: string; description?: string }[];
}

export interface EngineDeps {
  config?: Config;
  /** Injectable for tests (no real network). */
  fetchImpl?: typeof fetch;
}

/** A record of the last run, persisted so `q flag` can act on it. */
export interface LastRun {
  ts: number;
  question: string;
  routedVia: "llm" | "regex";
  model: string;
  tool?: string;
  matchedPattern?: string;
  answerPreview: string;
}
