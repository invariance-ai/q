import React from "react";
import { Box, Text } from "ink";
import type { Usage } from "../../engine/types.js";
import type { Theme } from "../theme.js";

export interface StatusBarProps {
  model: string;
  toolCount: number;
  usage: Usage | null;
  theme: Theme;
}

/**
 * Single-line status footer:
 *   model · N tools · {in}/{out} tokens · ^C abort  ^D exit
 * The active model is saffron; everything else is dim.
 */
function StatusBarInner({ model, toolCount, usage, theme }: StatusBarProps): React.JSX.Element {
  const tokens = usage ? `${usage.inputTokens}/${usage.outputTokens} tokens` : "0/0 tokens";
  const sep = theme.dim(" · ");
  return (
    <Box marginTop={1}>
      <Text>
        {theme.saffron(model)}
        {sep}
        {theme.dim(`${toolCount} tools`)}
        {sep}
        {theme.dim(tokens)}
        {sep}
        {theme.dim("^C abort  ^D exit")}
      </Text>
    </Box>
  );
}

export const StatusBar = React.memo(StatusBarInner);
