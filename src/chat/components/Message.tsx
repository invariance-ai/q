import React from "react";
import { Box, Text } from "ink";
import type { Turn } from "../../engine/types.js";
import type { Theme } from "../theme.js";
import { renderMarkdown } from "../markdown/render.js";

export interface MessageProps {
  turn: Turn;
  theme: Theme;
}

/**
 * A committed conversation turn. User turns render plain with a dim `you ───`
 * separator; assistant turns get a saffron `q ───` rule and markdown rendering.
 *
 * Memoized so live streaming below never repaints already-committed history.
 */
function MessageInner({ turn, theme }: MessageProps): React.JSX.Element {
  const width = Math.max(20, (process.stdout.columns || 80) - 2);

  if (turn.role === "user") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text>{theme.dim("you ───")}</Text>
        <Text>{theme.user(turn.content)}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>{theme.saffron("q ───")}</Text>
      <Text>{renderMarkdown(turn.content, width)}</Text>
    </Box>
  );
}

export const Message = React.memo(MessageInner);
