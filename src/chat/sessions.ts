import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { getConfigDir } from "../config/store.js";
import type { Turn } from "../engine/types.js";

/**
 * Local, on-disk chat session transcripts. Stored under the config dir so they
 * live next to settings; never uploaded. Pure Node (no Ink), so the `q
 * sessions` command stays dependency-light.
 */

export interface ChatSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  turns: Turn[];
}

export interface SessionMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  turnCount: number;
  firstMessage: string;
}

function sessionsDir(): string {
  return path.join(getConfigDir(), "sessions");
}

function sessionPath(id: string): string {
  return path.join(sessionsDir(), `${id}.json`);
}

function makeId(now: number): string {
  const d = new Date(now);
  const p = (n: number): string => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${stamp}-${randomUUID().slice(0, 4)}`;
}

export function newSession(model: string): ChatSession {
  const now = Date.now();
  return { id: makeId(now), createdAt: now, updatedAt: now, model, turns: [] };
}

/** Persist a session. No-op for empty conversations so we don't litter the dir. */
export function saveSession(session: ChatSession): void {
  if (session.turns.length === 0) return;
  fs.mkdirSync(sessionsDir(), { recursive: true, mode: 0o700 });
  const payload = JSON.stringify({ ...session, updatedAt: Date.now() }, null, 2) + "\n";
  fs.writeFileSync(sessionPath(session.id), payload, { mode: 0o600 });
}

export function loadSession(id: string): ChatSession | undefined {
  try {
    const raw = fs.readFileSync(sessionPath(id), "utf8");
    return JSON.parse(raw) as ChatSession;
  } catch {
    return undefined;
  }
}

export function removeSession(id: string): boolean {
  try {
    fs.unlinkSync(sessionPath(id));
    return true;
  } catch {
    return false;
  }
}

export function listSessions(): SessionMeta[] {
  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir());
  } catch {
    return [];
  }
  const metas: SessionMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const s = JSON.parse(fs.readFileSync(path.join(sessionsDir(), f), "utf8")) as ChatSession;
      const firstUser = s.turns.find((t) => t.role === "user");
      metas.push({
        id: s.id,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        model: s.model,
        turnCount: s.turns.length,
        firstMessage: firstUser?.content ?? "",
      });
    } catch {
      /* skip corrupt files */
    }
  }
  return metas.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function latestSession(): ChatSession | undefined {
  const metas = listSessions();
  const top = metas[0];
  return top ? loadSession(top.id) : undefined;
}

/** Resolve an exact id or a unique prefix (so users can type a short id). */
export function resolveSessionId(idOrPrefix: string): string | undefined {
  const metas = listSessions();
  const exact = metas.find((m) => m.id === idOrPrefix);
  if (exact) return exact.id;
  const matches = metas.filter((m) => m.id.startsWith(idOrPrefix));
  return matches.length === 1 ? matches[0]!.id : undefined;
}
