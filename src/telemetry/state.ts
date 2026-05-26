import { randomUUID } from "node:crypto";

import { readConfig, writeConfig } from "../config/store.js";
import type { TelemetryState } from "../config/schema.js";

/**
 * Opt-in telemetry state machine, backed by the config file. OFF by default.
 * Once the user enables OR dismisses the prompt, we never ask again. The prompt
 * is gated on real usage and spaced out, capped at a few asks total.
 */

const DAY_MS = 86_400_000;
const MIN_RUNS_BEFORE_PROMPT = 3;
const MAX_PROMPTS = 3;
const PROMPT_SPACING_MS = 7 * DAY_MS;

export function getTelemetry(): TelemetryState {
  return readConfig().telemetry;
}

export function setTelemetry(patch: Partial<TelemetryState>): void {
  const cfg = readConfig();
  cfg.telemetry = { ...cfg.telemetry, ...patch };
  writeConfig(cfg);
}

/** Hard kill-switch via environment, regardless of config. */
export function isHardDisabled(): boolean {
  return Boolean(process.env["Q_NO_TELEMETRY"] || process.env["DO_NOT_TRACK"]);
}

export function isEnabled(): boolean {
  return !isHardDisabled() && getTelemetry().enabled;
}

export function enableTelemetry(): void {
  const t = getTelemetry();
  setTelemetry({ enabled: true, dismissed: false, anonId: t.anonId ?? randomUUID() });
}

export function disableTelemetry(): void {
  setTelemetry({ enabled: false });
}

/** User declined / X'd out the prompt: never ask again. */
export function dismissPrompt(): void {
  setTelemetry({ dismissed: true });
}

/** Count a real invocation (gates the first opt-in prompt). */
export function recordRun(): void {
  const t = getTelemetry();
  setTelemetry({ runCount: t.runCount + 1, firstRunAt: t.firstRunAt ?? Date.now() });
}

export function markPrompted(): void {
  const t = getTelemetry();
  setTelemetry({ promptCount: t.promptCount + 1, lastPromptAt: Date.now() });
}

/** Whether to show the opt-in prompt now. */
export function shouldPrompt(): boolean {
  if (isHardDisabled()) return false;
  if (!process.stdout.isTTY || !process.stdin.isTTY) return false;
  const t = getTelemetry();
  if (t.enabled || t.dismissed) return false;
  if (t.promptCount >= MAX_PROMPTS) return false;
  if (t.runCount < MIN_RUNS_BEFORE_PROMPT) return false;
  if (t.lastPromptAt && Date.now() - t.lastPromptAt < PROMPT_SPACING_MS) return false;
  return true;
}
