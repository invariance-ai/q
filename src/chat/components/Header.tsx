import React from "react";
import { Box, Text } from "ink";
import type { Theme } from "../theme.js";

export interface HeaderProps {
  model: string;
  toolCount: number;
  theme: Theme;
}

/**
 * Branded banner: a compact `q · ask anything` wordmark in saffron, plus a
 * tagline showing the active model and tool availability.
 */
function HeaderInner({ model, toolCount, theme }: HeaderProps): React.JSX.Element {
  const tools =
    toolCount > 0 ? `${toolCount} tool${toolCount === 1 ? "" : "s"} enabled` : "no tools";
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        {theme.saffron("q")} {theme.dim("·")} {theme.saffron("ask anything")}
      </Text>
      <Text>{theme.dim(`${model} · ${tools}`)}</Text>
    </Box>
  );
}

export const Header = React.memo(HeaderInner);
