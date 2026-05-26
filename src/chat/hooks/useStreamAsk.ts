import { useRef, type Dispatch } from "react";
import type { QEngine } from "../../engine/types.js";
import type { ChatAction, ChatState } from "./useChatSession.js";

/**
 * Bridges the imperative engine stream into reducer dispatches.
 *
 * Token deltas are coalesced: instead of dispatching per character (which would
 * repaint Ink on every byte), we accumulate into a ref and flush on a short
 * timer (~24ms ≈ 40fps). The final flush happens synchronously on done/error so
 * no tail tokens are lost.
 */

const FLUSH_INTERVAL_MS = 24;

export interface StreamControls {
  submit(question: string): void;
  abort(): void;
}

export function useStreamAsk(
  engine: QEngine,
  dispatch: Dispatch<ChatAction>,
  getState: () => ChatState,
): StreamControls {
  const controllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef<boolean>(false);

  function flush(): void {
    if (pendingRef.current.length > 0) {
      const text = pendingRef.current;
      pendingRef.current = "";
      dispatch({ type: "TOKEN", text });
    }
  }

  function clearTimer(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleFlush(): void {
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }

  function enqueueToken(text: string): void {
    pendingRef.current += text;
    scheduleFlush();
  }

  function submit(question: string): void {
    if (runningRef.current) return;
    const q = question.trim();
    if (q.length === 0) return;

    // Snapshot history BEFORE adding the new user turn, then record it.
    const history = getState().history.slice();
    const model = getState().model;
    const think = getState().think;
    dispatch({ type: "SUBMIT", question: q });

    const controller = new AbortController();
    controllerRef.current = controller;
    runningRef.current = true;
    pendingRef.current = "";

    void (async () => {
      try {
        for await (const ev of engine.stream({
          question: q,
          history,
          model,
          think,
          signal: controller.signal,
        })) {
          switch (ev.type) {
            case "text_delta":
              enqueueToken(ev.text);
              break;
            case "thinking_delta":
              // v1: thinking deltas are not surfaced as content.
              break;
            case "routed":
              dispatch({ type: "ROUTED", via: ev.via, pattern: ev.pattern, tool: ev.tool });
              break;
            case "tool_call_start":
              clearTimer();
              flush();
              dispatch({ type: "TOOL_CALL", tool: ev.tool });
              break;
            case "tool_call_end":
              dispatch({ type: "TOOL_RESULT", record: ev.record });
              break;
            case "done":
              clearTimer();
              flush();
              dispatch({ type: "DONE", result: ev.result });
              break;
            case "error":
              clearTimer();
              flush();
              dispatch({ type: "ERROR", error: ev.error });
              break;
          }
        }
        // Stream ended without an explicit done (e.g. mock): flush + commit.
        clearTimer();
        flush();
        if (getState().phase !== "idle") dispatch({ type: "DONE" });
      } catch (err) {
        clearTimer();
        flush();
        if (controller.signal.aborted) {
          dispatch({ type: "ABORT" });
        } else {
          dispatch({ type: "ERROR", error: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        runningRef.current = false;
        controllerRef.current = null;
      }
    })();
  }

  function abort(): void {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
  }

  return { submit, abort };
}
