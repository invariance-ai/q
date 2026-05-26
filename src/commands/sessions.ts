import chalk from "chalk";
import { Command } from "commander";

import {
  listSessions,
  loadSession,
  removeSession,
  resolveSessionId,
} from "../chat/sessions.js";
import { renderMarkdownLite } from "../render/markdown.js";

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

export function buildSessionsCommand(): Command {
  const sessions = new Command("sessions").description("List, show, and manage saved chat sessions");

  sessions
    .command("list")
    .description("List saved chat sessions (most recent first)")
    .action(() => {
      const metas = listSessions();
      if (metas.length === 0) {
        process.stdout.write(chalk.dim("no saved sessions yet. Start one with: q chat") + "\n");
        return;
      }
      for (const m of metas) {
        const id = chalk.hex("#f4a020")(m.id);
        const meta = chalk.dim(`${relTime(m.updatedAt)} · ${m.model} · ${m.turnCount} turns`);
        process.stdout.write(`${id}  ${meta}\n  ${truncate(m.firstMessage, 72)}\n`);
      }
    });

  sessions
    .command("show <id>")
    .description("Print a session transcript (id or unique prefix)")
    .action((idArg: string) => {
      const id = resolveSessionId(idArg);
      const session = id ? loadSession(id) : undefined;
      if (!session) {
        process.stderr.write(chalk.yellow(`no session matching "${idArg}"`) + "\n");
        process.exitCode = 1;
        return;
      }
      process.stdout.write(chalk.dim(`# ${session.id} · ${session.model}\n\n`));
      for (const turn of session.turns) {
        const label = turn.role === "user" ? chalk.dim("you ───") : chalk.hex("#f4a020")("q ───");
        process.stdout.write(`${label}\n`);
        const body = turn.role === "assistant" ? renderMarkdownLite(turn.content) : turn.content;
        process.stdout.write(body + "\n\n");
      }
    });

  sessions
    .command("rm <id>")
    .description("Delete a saved session (id or unique prefix)")
    .action((idArg: string) => {
      const id = resolveSessionId(idArg);
      if (!id || !removeSession(id)) {
        process.stderr.write(chalk.yellow(`no session matching "${idArg}"`) + "\n");
        process.exitCode = 1;
        return;
      }
      process.stdout.write(chalk.green(`removed session ${id}`) + "\n");
    });

  return sessions;
}
