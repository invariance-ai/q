import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  newSession,
  saveSession,
  listSessions,
  loadSession,
  removeSession,
  latestSession,
  resolveSessionId,
} from "./sessions.js";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "q-sessions-"));
  process.env["XDG_CONFIG_HOME"] = tmp;
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("sessions", () => {
  it("saves, lists, loads, resolves by prefix, and removes", () => {
    const s = newSession("gpt-4o-mini");
    s.turns.push({ role: "user", content: "hello there" });
    s.turns.push({ role: "assistant", content: "hi" });
    saveSession(s);

    const metas = listSessions();
    expect(metas).toHaveLength(1);
    expect(metas[0]!.firstMessage).toBe("hello there");
    expect(metas[0]!.turnCount).toBe(2);
    expect(metas[0]!.model).toBe("gpt-4o-mini");

    expect(loadSession(s.id)?.turns).toHaveLength(2);
    expect(latestSession()?.id).toBe(s.id);
    expect(resolveSessionId(s.id.slice(0, 8))).toBe(s.id);

    expect(removeSession(s.id)).toBe(true);
    expect(listSessions()).toHaveLength(0);
  });

  it("does not persist empty conversations", () => {
    saveSession(newSession("gpt-4o-mini"));
    expect(listSessions()).toHaveLength(0);
  });

  it("orders sessions most-recent-first", () => {
    // saveSession stamps updatedAt = Date.now() on every write, so control the
    // clock to get deterministic ordering (otherwise two saves can land in the
    // same millisecond under load and the order becomes a coin flip).
    const now = vi.spyOn(Date, "now");
    try {
      now.mockReturnValue(1_000);
      const a = newSession("gpt-4o-mini");
      a.turns.push({ role: "user", content: "first" });
      saveSession(a);

      now.mockReturnValue(5_000);
      const b = newSession("gpt-4o-mini");
      b.turns.push({ role: "user", content: "second" });
      saveSession(b);
    } finally {
      now.mockRestore();
    }

    const metas = listSessions();
    expect(metas[0]!.firstMessage).toBe("second");
    expect(metas[1]!.firstMessage).toBe("first");
  });
});
