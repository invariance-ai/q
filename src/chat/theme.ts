import chalk from "chalk";

/**
 * Visual theme for the chat UI. Saffron accent (#f4a020) on near-black.
 *
 * Color is applied via chalk and degrades gracefully by the detected color
 * level so the UI stays legible from truecolor terminals down to `NO_COLOR`:
 *   - level 3 (truecolor): chalk.hex("#f4a020")
 *   - level 2 (256):       chalk.ansi256(214) accent / 233 dim
 *   - level 1 (16):        chalk.yellowBright
 *   - level 0 (none):      identity (plain text)
 *
 * We never paint a full-screen background — only foreground accents.
 */
export interface Theme {
  saffron(s: string): string;
  user(s: string): string;
  assistant(s: string): string;
  dim(s: string): string;
  /** Ink <Box borderColor> value (hex string or named color). */
  borderColor: string;
}

const SAFFRON_HEX = "#f4a020";

const identity = (s: string): string => s;

/**
 * Build a theme for the given chalk color `level` (0–3). Defaults to the
 * level chalk auto-detects for stdout (0 under FORCE_COLOR=0 / NO_COLOR).
 */
export function makeTheme(level?: number): Theme {
  const lvl = level ?? chalk.level ?? 0;

  if (lvl >= 3) {
    const saffron = chalk.hex(SAFFRON_HEX);
    return {
      saffron: (s) => saffron(s),
      user: (s) => chalk.bold(s),
      assistant: (s) => s,
      dim: (s) => chalk.dim(s),
      borderColor: SAFFRON_HEX,
    };
  }

  if (lvl === 2) {
    // 256-color: 214 ≈ saffron, 245 for a soft dim.
    const saffron = chalk.ansi256(214);
    return {
      saffron: (s) => saffron(s),
      user: (s) => chalk.bold(s),
      assistant: (s) => s,
      dim: (s) => chalk.ansi256(245)(s),
      borderColor: "#f4a020",
    };
  }

  if (lvl === 1) {
    return {
      saffron: (s) => chalk.yellowBright(s),
      user: (s) => chalk.bold(s),
      assistant: (s) => s,
      dim: (s) => chalk.dim(s),
      borderColor: "yellow",
    };
  }

  // No color: identity everywhere; Ink still draws borders with box chars.
  return {
    saffron: identity,
    user: identity,
    assistant: identity,
    dim: identity,
    borderColor: "gray",
  };
}
