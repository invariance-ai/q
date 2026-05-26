import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildToolsCommand } from "./tools.js";
import { addTool, listToolEntries } from "../tools/registry.js";
import type { ToolEntry } from "../config/schema.js";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "q-tools-"));
  process.env["XDG_CONFIG_HOME"] = tmp;
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A minimal valid tool entry (schema fills the rest of the defaults). */
function seedTool(name: string): void {
  addTool({
    name,
    description: `desc for ${name}`,
    url: "https://example.com/api",
  } as unknown as ToolEntry);
}

async function run(args: string[]): Promise<void> {
  const cmd = buildToolsCommand();
  cmd.exitOverride(); // don't call process.exit in tests
  await cmd.parseAsync(args, { from: "user" });
  // The actions wrap work in a fire-and-forget promise; let it settle.
  await new Promise((r) => setTimeout(r, 0));
}

describe("tools export/import round-trip", () => {
  it("exports to a file and re-imports into a clean registry", async () => {
    seedTool("alpha");
    seedTool("beta");
    expect(listToolEntries()).toHaveLength(2);

    const file = path.join(tmp, "registry.json");
    await run(["export", "--file", file]);

    const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(Array.isArray(onDisk)).toBe(true);
    expect(onDisk).toHaveLength(2);

    // Wipe the registry by switching to a fresh config dir, then import.
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "q-tools2-"));
    process.env["XDG_CONFIG_HOME"] = tmp2;
    expect(listToolEntries()).toHaveLength(0);

    await run(["import", file]);
    const names = listToolEntries()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual(["alpha", "beta"]);

    fs.rmSync(tmp2, { recursive: true, force: true });
  });

  it("import skips existing names unless --overwrite", async () => {
    seedTool("alpha");
    const file = path.join(tmp, "reg.json");
    // Hand-craft a file with a clashing name + a fresh one + an invalid entry.
    const payload = [
      { name: "alpha", description: "new desc", url: "https://example.com/v2" },
      { name: "gamma", description: "g", url: "https://example.com/g" },
      { name: "Invalid Name", description: "x", url: "https://example.com/x" },
    ];
    fs.writeFileSync(file, JSON.stringify(payload), "utf8");

    await run(["import", file]);
    const after = listToolEntries();
    // alpha skipped (kept old desc), gamma added, invalid dropped.
    expect(after.map((t) => t.name).sort()).toEqual(["alpha", "gamma"]);
    expect(after.find((t) => t.name === "alpha")?.description).toBe("desc for alpha");

    await run(["import", file, "--overwrite"]);
    const overwritten = listToolEntries().find((t) => t.name === "alpha");
    expect(overwritten?.description).toBe("new desc");
  });
});
