import chalk from "chalk";

/**
 * Light terminal markdown renderer. Deliberately tiny — no `marked` /
 * `marked-terminal` (those are reserved for the rich chat UI). Handles the
 * common shapes that show up in one-shot answers: headers, bold, inline code,
 * and bullet lists. Everything else passes through verbatim.
 */
export function renderMarkdownLite(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    out.push(renderLine(line));
  }

  return out.join("\n");
}

function renderLine(line: string): string {
  // Headers: leading #'s → bold (heavier weight for h1/h2).
  const header = /^(#{1,6})\s+(.*)$/.exec(line);
  if (header) {
    const level = header[1]?.length ?? 1;
    const text = header[2] ?? "";
    const inline = renderInline(text);
    return level <= 2 ? chalk.bold.underline(inline) : chalk.bold(inline);
  }

  // Bullets: -, *, or + at the start (preserving indentation).
  const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
  if (bullet) {
    const indent = bullet[1] ?? "";
    const text = bullet[2] ?? "";
    return `${indent}${chalk.hex("#f4a020")("•")} ${renderInline(text)}`;
  }

  return renderInline(line);
}

/** Apply inline styles: **bold** and `code`. */
function renderInline(text: string): string {
  // Inline code first so its contents aren't re-processed for bold.
  let out = text.replace(/`([^`]+)`/g, (_m, code: string) => chalk.cyan(code));
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, b: string) => chalk.bold(b));
  return out;
}
