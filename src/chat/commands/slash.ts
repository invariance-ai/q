/**
 * Pure slash-command parser. No Ink, no side effects — the App decides what to
 * do with each result. Returns `null` when the input is not a slash command so
 * the caller can treat it as a normal question.
 */

export type SlashResult =
  | { kind: "handled"; render?: string }
  | { kind: "exit" }
  | { kind: "passthrough" }
  | { kind: "setModel"; model: string }
  | { kind: "clear" }
  | { kind: "flag"; note?: string };

const HELP_TEXT = [
  "commands:",
  "  /model <id>   switch the active model",
  "  /tools        list registered tools",
  "  /flag [note]  flag the last answer as wrong (alias /wrong)",
  "  /clear        clear the conversation",
  "  /help         show this help",
  "  /exit         quit (alias /quit)",
].join("\n");

export function parseSlash(input: string): SlashResult | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  // Split command from the remainder (preserving the rest verbatim).
  const match = /^\/(\S+)\s*([\s\S]*)$/.exec(trimmed);
  if (!match) return { kind: "passthrough" };

  const cmd = (match[1] ?? "").toLowerCase();
  const rest = (match[2] ?? "").trim();

  switch (cmd) {
    case "exit":
    case "quit":
      return { kind: "exit" };

    case "clear":
      return { kind: "clear" };

    case "help":
      return { kind: "handled", render: HELP_TEXT };

    case "tools":
      // App fills in the actual list; signal intent here.
      return { kind: "handled" };

    case "model":
      if (rest.length === 0) {
        return { kind: "handled", render: "usage: /model <id>" };
      }
      return { kind: "setModel", model: rest };

    case "flag":
    case "wrong":
      return rest.length > 0 ? { kind: "flag", note: rest } : { kind: "flag" };

    default:
      return { kind: "handled", render: `unknown command: /${cmd}` };
  }
}

export { HELP_TEXT };
