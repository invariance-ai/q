import { useReducer, type Dispatch } from "react";
import type { Turn, Usage, AskResult, ToolCallRecord } from "../../engine/types.js";

/**
 * Reducer-backed chat session state. The reducer is exported on its own so it
 * can be unit-tested without React/Ink.
 */

export type Phase = "idle" | "thinking" | "streaming" | "tool";

export interface ToolLogEntry {
  name: string;
  done: boolean;
}

export interface ChatState {
  history: Turn[];
  phase: Phase;
  streamingBuffer: string;
  activeTool: string | null;
  toolLog: ToolLogEntry[];
  routedPattern: string | null;
  model: string;
  usage: Usage | null;
  error: string | null;
  /** Whether extended thinking is enabled for subsequent asks. */
  think: boolean;
}

export type ChatAction =
  | { type: "SUBMIT"; question: string }
  | { type: "TOKEN"; text: string }
  | { type: "TOOL_CALL"; tool: string }
  | { type: "TOOL_RESULT"; record: ToolCallRecord }
  | { type: "ROUTED"; via: "llm" | "regex"; pattern?: string; tool?: string }
  | { type: "DONE"; result?: AskResult }
  | { type: "ABORT" }
  | { type: "ERROR"; error: string }
  | { type: "SET_MODEL"; model: string }
  | { type: "TOGGLE_THINK" }
  | { type: "CLEAR" };

export function initialChatState(model: string, initialHistory: Turn[] = []): ChatState {
  return {
    history: initialHistory,
    phase: "idle",
    streamingBuffer: "",
    activeTool: null,
    toolLog: [],
    routedPattern: null,
    model,
    usage: null,
    error: null,
    think: false,
  };
}

/** Commit the in-flight buffer (if any) as an assistant turn. */
function commitBuffer(state: ChatState): Turn[] {
  const text = state.streamingBuffer;
  if (text.trim().length === 0) return state.history;
  return [...state.history, { role: "assistant", content: text }];
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SUBMIT":
      return {
        ...state,
        history: [...state.history, { role: "user", content: action.question }],
        phase: "thinking",
        streamingBuffer: "",
        activeTool: null,
        toolLog: [],
        routedPattern: null,
        error: null,
      };

    case "TOKEN":
      return {
        ...state,
        // First token flips thinking → streaming.
        phase: "streaming",
        activeTool: null,
        streamingBuffer: state.streamingBuffer + action.text,
      };

    case "TOOL_CALL":
      return {
        ...state,
        phase: "tool",
        activeTool: action.tool,
        toolLog: [...state.toolLog, { name: action.tool, done: false }],
      };

    case "TOOL_RESULT": {
      // Mark the most recent un-done entry matching the tool as done.
      const name = action.record.tool;
      let marked = false;
      const toolLog = state.toolLog
        .slice()
        .reverse()
        .map((e) => {
          if (!marked && !e.done && e.name === name) {
            marked = true;
            return { ...e, done: true };
          }
          return e;
        })
        .reverse();
      return {
        ...state,
        // After a tool result we're waiting on the model again.
        phase: "thinking",
        activeTool: null,
        toolLog,
      };
    }

    case "ROUTED":
      return {
        ...state,
        routedPattern: action.pattern ?? (action.via === "regex" ? "regex" : null),
      };

    case "DONE": {
      const history = commitBuffer(state);
      return {
        ...state,
        history,
        phase: "idle",
        streamingBuffer: "",
        activeTool: null,
        usage: action.result?.usage ?? state.usage,
      };
    }

    case "ABORT": {
      const history = commitBuffer(state);
      return {
        ...state,
        history,
        phase: "idle",
        streamingBuffer: "",
        activeTool: null,
      };
    }

    case "ERROR":
      return {
        ...state,
        phase: "idle",
        streamingBuffer: "",
        activeTool: null,
        error: action.error,
      };

    case "SET_MODEL":
      return { ...state, model: action.model };

    case "TOGGLE_THINK":
      return { ...state, think: !state.think };

    case "CLEAR":
      // Fresh conversation, but keep the model + thinking preference.
      return { ...initialChatState(state.model), think: state.think };

    default:
      return state;
  }
}

export interface UseChatSession {
  state: ChatState;
  dispatch: Dispatch<ChatAction>;
}

export function useChatSession(model: string, initialHistory: Turn[] = []): UseChatSession {
  const [state, dispatch] = useReducer(chatReducer, undefined, () =>
    initialChatState(model, initialHistory),
  );
  return { state, dispatch };
}
