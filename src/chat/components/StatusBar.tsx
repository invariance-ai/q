import React from "react";
import { Box, Text } from "ink";
import type { Usage } from "../../engine/types.js";
import type { Theme } from "../theme.js";

export interface StatusBarProps {
  model: string;
  toolCount: number;
  usage: Usage | null;
  theme: Theme;
  /** Whether extended thinking is enabled (shown only when on). */
  think?: boolean;
}

/**
 * Single-line status footer:
 *   model · N tools · {in}/{out} tokens · [think] · ^C abort  ^D exit
 * The active model is saffron; everything else is dim.
 */
function StatusBarInner({ model, toolCount, usage, theme, think }: StatusBarProps): React.JSX.Element {
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
        {think ? sep : null}
        {think ? theme.saffron("think") : null}
        {sep}
        {theme.dim("^C abort  ^D exit")}
      </Text>
    </Box>
  );
}

export const StatusBar = React.memo(StatusBarInner);
