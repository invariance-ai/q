import fs from "node:fs";
import path from "node:path";
import type { LastRun } from "./types.js";
import { getConfigDir } from "../config/store.js";
import { redact } from "../util/redact.js";
import { disablePattern } from "../tools/registry.js";

/**
 * Persisted last-run state + feedback log. `q flag` reads the last run and
 * appends a feedback line, optionally disabling the matched regex pattern.
 */

function lastRunPath(): string {
  return path.join(getConfigDir(), "last.json");
}

function feedbackPath(): string {
  return path.join(getConfigDir(), "feedback.jsonl");
}

function ensureDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function recordLastRun(run: LastRun): void {
  ensureDir();
  const redacted: LastRun = {
    ...run,
    question: redact(run.question),
    answerPreview: redact(run.answerPreview),
  };
  const file = lastRunPath();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(redacted, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(tmp, file);
}

export function readLastRun(): LastRun | undefined {
  const file = lastRunPath();
  if (!fs.existsSync(file)) return undefined;
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw) as LastRun;
  } catch {
    return undefined;
  }
}

export function flagLast(opts: {
  note?: string;
  disablePattern?: boolean;
  right?: boolean;
}): { ok: boolean; message: string } {
  const last = readLastRun();
  if (!last) {
    return { ok: false, message: "No previous run found to flag." };
  }

  let patternDisabled = false;
  if (opts.disablePattern) {
    if (last.routedVia === "regex" && last.tool && last.matchedPattern) {
      patternDisabled = disablePattern(last.tool, last.matchedPattern);
    }
  }

  const entry = {
    ts: Date.now(),
    question: redact(last.question),
    routedVia: last.routedVia,
    model: last.model,
    tool: last.tool,
    matchedPattern: last.matchedPattern,
    right: opts.right ?? false,
    note: opts.note ? redact(opts.note) : undefined,
    patternDisabled,
  };

  ensureDir();
  fs.appendFileSync(feedbackPath(), JSON.stringify(entry) + "\n", {
    mode: 0o600,
  });

  const verdict = opts.right ? "marked correct" : "flagged";
  let message = `Recorded: last answer ${verdict}.`;
  if (opts.note) message += ` Note saved.`;
  if (opts.disablePattern) {
    message += patternDisabled
      ? ` Disabled regex pattern "${last.matchedPattern}" on tool "${last.tool}".`
      : last.routedVia === "regex"
        ? ` (Could not find the matched pattern to disable.)`
        : ` (Last run was not regex-routed; nothing to disable.)`;
  }
  return { ok: true, message };
}
