import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { Theme } from "../theme.js";

export interface InputBoxProps {
  value: string;
  onChange(value: string): void;
  onSubmit(value: string): void;
  theme: Theme;
  disabled?: boolean;
}

/**
 * Bordered single-line input with a saffron `›` caret.
 *
 * v1 is single-line via ink-text-input. Future enhancement: Shift+Enter for a
 * soft newline / multi-line composition (ink-text-input doesn't expose this, so
 * it would need a custom useInput-based editor).
 */
function InputBoxInner({
  value,
  onChange,
  onSubmit,
  theme,
  disabled = false,
}: InputBoxProps): React.JSX.Element {
  return (
    <Box borderStyle="round" borderColor={theme.borderColor} paddingX={1}>
      <Text>{theme.saffron("› ")}</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        focus={!disabled}
        showCursor={!disabled}
        placeholder={disabled ? "…" : "type a message…  (/ for commands)"}
      />
    </Box>
  );
}

export const InputBox = React.memo(InputBoxInner);
