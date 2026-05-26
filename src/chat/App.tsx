import React, { useState, useRef, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { QEngine } from "../engine/types.js";
import { makeTheme } from "./theme.js";
import { parseSlash } from "./commands/slash.js";
import { useChatSession, type ChatState } from "./hooks/useChatSession.js";
import { useStreamAsk } from "./hooks/useStreamAsk.js";
import { Header } from "./components/Header.js";
import { History } from "./components/History.js";
import { StatusBar } from "./components/StatusBar.js";
import { InputBox } from "./components/InputBox.js";

export interface AppProps {
  engine: QEngine;
  initialModel: string;
  models: string[];
  tools: { name: string; description?: string }[];
  /** Optional hook for /flag; falls back to a dynamic feedback import. */
  onFlag?: (note?: string) => void;
}

/**
 * Root chat component. Owns session state + the stream bridge, wires global
 * keys (Ctrl+C / Ctrl+D), and routes input through the slash parser before
 * falling through to a normal ask.
 */
export function App({
  engine,
  initialModel,
  models,
  tools,
  onFlag,
}: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const theme = makeTheme();
  const { state, dispatch } = useChatSession(initialModel);

  // Keep a live ref so the stream hook reads current state without re-binding.
  const stateRef = useRef<ChatState>(state);
  stateRef.current = state;
  const getState = useCallback(() => stateRef.current, []);

  const { submit, abort } = useStreamAsk(engine, dispatch, getState);

  const [input, setInput] = useState("");
  // Transient one-off lines (slash command output, acks) shown above input.
  const [notice, setNotice] = useState<string | null>(null);
  const ctrlCArmed = useRef(false);

  const busy = state.phase !== "idle";

  const handleSubmit = useCallback(
    (raw: string) => {
      const value = raw;
      setInput("");
      setNotice(null);

      const slash = parseSlash(value);
      if (slash === null) {
        if (value.trim().length > 0) submit(value);
        return;
      }

      switch (slash.kind) {
        case "exit":
          exit();
          return;
        case "clear":
          dispatch({ type: "CLEAR" });
          return;
        case "setModel": {
          if (models.includes(slash.model)) {
            dispatch({ type: "SET_MODEL", model: slash.model });
            setNotice(theme.dim(`model → ${theme.saffron(slash.model)}`));
          } else {
            setNotice(theme.dim(`unknown model: ${slash.model} (have: ${models.join(", ")})`));
          }
          return;
        }
        case "flag": {
          // Engine has no flag method; ack here and best-effort persist.
          setNotice(theme.saffron("⚑ flagged the last answer" + (slash.note ? `: ${slash.note}` : "")));
          if (onFlag) {
            onFlag(slash.note);
          } else {
            void (async () => {
              try {
                const mod: {
                  flagLast?: (opts: { note?: string }) => unknown;
                } = await import("../engine/feedback.js");
                mod.flagLast?.(slash.note ? { note: slash.note } : {});
              } catch {
                /* feedback module optional (e.g. tests with a mock engine) */
              }
            })();
          }
          return;
        }
        case "handled": {
          // /tools has no render text — fill the list in here.
          if (slash.render) {
            setNotice(theme.dim(slash.render));
          } else {
            const list =
              tools.length === 0
                ? "no tools registered"
                : tools.map((t) => `  ${t.name}${t.description ? ` — ${t.description}` : ""}`).join("\n");
            setNotice(theme.dim(`tools:\n${list}`));
          }
          return;
        }
        case "passthrough":
          if (value.trim().length > 0) submit(value);
          return;
      }
    },
    [submit, exit, dispatch, models, tools, theme, onFlag],
  );

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "c") {
      if (busy) {
        abort();
        ctrlCArmed.current = false;
        return;
      }
      if (ctrlCArmed.current) {
        exit();
        return;
      }
      ctrlCArmed.current = true;
      setNotice(theme.dim("press Ctrl+C again to exit"));
      return;
    }
    // Any other key disarms the double-Ctrl+C.
    ctrlCArmed.current = false;

    if (key.ctrl && inputChar === "d") {
      if (input.length === 0) exit();
      return;
    }
  });

  return (
    <Box flexDirection="column">
      <Header model={state.model} toolCount={tools.length} theme={theme} />
      <History history={state.history} state={state} theme={theme} />
      {state.error ? <Text color="red">error: {state.error}</Text> : null}
      {notice ? <Box marginBottom={1}><Text>{notice}</Text></Box> : null}
      <StatusBar
        model={state.model}
        toolCount={tools.length}
        usage={state.usage}
        theme={theme}
      />
      <InputBox
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        theme={theme}
        disabled={busy}
      />
    </Box>
  );
}
