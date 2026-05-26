import React from "react";
import { Box, Static } from "ink";
import type { Turn } from "../../engine/types.js";
import type { Theme } from "../theme.js";
import type { ChatState } from "../hooks/useChatSession.js";
import { Message } from "./Message.js";
import { StreamingMessage } from "./StreamingMessage.js";

export interface HistoryProps {
  history: Turn[];
  state: ChatState;
  theme: Theme;
}

/**
 * Committed history renders inside Ink <Static>, which writes each item to the
 * terminal exactly once and lets native scrollback handle the rest (no
 * repainting prior turns when new tokens arrive). The live, mutating
 * <StreamingMessage> renders below the static region.
 */
export function History({ history, state, theme }: HistoryProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Static items={history.map((turn, index) => ({ turn, index }))}>
        {(item) => <Message key={item.index} turn={item.turn} theme={theme} />}
      </Static>
      <StreamingMessage
        buffer={state.streamingBuffer}
        phase={state.phase}
        activeTool={state.activeTool}
        toolLog={state.toolLog}
        theme={theme}
      />
    </Box>
  );
}
