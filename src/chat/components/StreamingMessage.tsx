import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { Theme } from "../theme.js";
import type { Phase, ToolLogEntry } from "../hooks/useChatSession.js";

export interface StreamingMessageProps {
  buffer: string;
  phase: Phase;
  activeTool: string | null;
  toolLog: ToolLogEntry[];
  theme: Theme;
}

/**
 * The in-flight assistant message. While streaming we render the buffer as
 * PLAIN text (markdown is applied only once committed, in <Message/>) plus a
 * saffron block caret. Tool activity is shown inline.
 */
export function StreamingMessage({
  buffer,
  phase,
  activeTool,
  toolLog,
  theme,
}: StreamingMessageProps): React.JSX.Element | null {
  // Nothing in flight.
  if (phase === "idle") return null;

  const caret = theme.saffron("▌");
  const showThinking = phase === "thinking" && buffer.length === 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>{theme.saffron("q ───")}</Text>

      {/* Tool log lines: → calling tool: X  /  ✓ X */}
      {toolLog.map((t, i) => (
        <Text key={`${t.name}-${i}`}>
          {t.done ? theme.saffron("✓ ") + theme.dim(t.name) : theme.dim(`→ calling tool: ${t.name}`)}
        </Text>
      ))}

      {showThinking ? (
        <Text>
          <Text color={theme.borderColor}>
            <Spinner type="dots" />
          </Text>{" "}
          {theme.dim(activeTool ? `running ${activeTool}…` : "thinking…")}
        </Text>
      ) : buffer.length > 0 ? (
        <Text>
          {theme.assistant(buffer)}
          {caret}
        </Text>
      ) : phase === "tool" ? (
        <Text>
          <Text color={theme.borderColor}>
            <Spinner type="dots" />
          </Text>{" "}
          {theme.dim(activeTool ? `running ${activeTool}…` : "working…")}
        </Text>
      ) : (
        <Text>{caret}</Text>
      )}
    </Box>
  );
}
