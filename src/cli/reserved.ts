/**
 * Reserved top-level subcommand names. Any first non-flag token NOT in this set
 * is treated as free-text and routed to `ask` via the default root argument.
 */
export const RESERVED = new Set([
  "ask",
  "config",
  "model",
  "tools",
  "feature",
  "flag",
  "chat",
  "help",
]);

export function isReserved(token: string): boolean {
  return RESERVED.has(token);
}
