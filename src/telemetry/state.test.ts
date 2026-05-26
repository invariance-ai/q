import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getTelemetry,
  enableTelemetry,
  disableTelemetry,
  dismissPrompt,
  recordRun,
  isEnabled,
  isHardDisabled,
  shouldPrompt,
} from "./state.js";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "q-telemetry-"));
  process.env["XDG_CONFIG_HOME"] = tmp;
  delete process.env["Q_NO_TELEMETRY"];
  delete process.env["DO_NOT_TRACK"];
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  delete process.env["Q_NO_TELEMETRY"];
  delete process.env["DO_NOT_TRACK"];
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("telemetry state", () => {
  it("is off by default", () => {
    expect(getTelemetry().enabled).toBe(false);
    expect(isEnabled()).toBe(false);
  });

  it("enable sets an anon id; disable clears the flag", () => {
    enableTelemetry();
    const t = getTelemetry();
    expect(t.enabled).toBe(true);
    expect(typeof t.anonId).toBe("string");
    expect(t.anonId!.length).toBeGreaterThan(8);
    disableTelemetry();
    expect(getTelemetry().enabled).toBe(false);
  });

  it("hard kill-switch overrides an enabled config", () => {
    enableTelemetry();
    process.env["Q_NO_TELEMETRY"] = "1";
    expect(isHardDisabled()).toBe(true);
    expect(isEnabled()).toBe(false);
  });

  it("never prompts once dismissed or enabled", () => {
    recordRun();
    recordRun();
    recordRun();
    dismissPrompt();
    expect(shouldPrompt()).toBe(false);
    enableTelemetry();
    expect(shouldPrompt()).toBe(false);
  });
});
