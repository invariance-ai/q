import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";

import { isReserved, RESERVED } from "./reserved.js";
import { addGlobalOptions, collectGlobalFlags, toAskParams, type GlobalFlags } from "./globals.js";

describe("reserved tokens", () => {
  it("recognizes every reserved subcommand", () => {
    for (const name of ["ask", "config", "model", "tools", "feature", "flag", "chat", "help"]) {
      expect(isReserved(name)).toBe(true);
    }
  });

  it("treats free text as not reserved", () => {
    for (const word of ["what", "summarize", "nis", "hello", "explain"]) {
      expect(isReserved(word)).toBe(false);
    }
  });

  it("RESERVED set matches the documented contract", () => {
    expect([...RESERVED].sort()).toEqual(
      ["ask", "chat", "config", "feature", "flag", "help", "model", "tools"].sort(),
    );
  });
});

/**
 * Build a minimal program mirroring program.ts's routing shape WITHOUT pulling
 * in Agent A's engine/network modules. We assert that reserved first tokens hit
 * their subcommand action and free text hits the default `[query...]` action.
 */
function makeStubProgram(spies: { ask: (q: string) => void; cfg: () => void }): Command {
  const program = new Command("q");
  program.enablePositionalOptions().allowExcessArguments(true).exitOverride();
  addGlobalOptions(program);

  const config = new Command("config");
  config.exitOverride();
  config.command("list").action(() => spies.cfg());
  program.addCommand(config);

  program.argument("[query...]").action((query: string[]) => {
    if (query.length > 0) spies.ask(query.join(" "));
  });

  return program;
}

describe("argument routing", () => {
  it("routes a reserved subcommand to its action, not ask", async () => {
    const ask = vi.fn();
    const cfg = vi.fn();
    const program = makeStubProgram({ ask, cfg });
    await program.parseAsync(["node", "q", "config", "list"]);
    expect(cfg).toHaveBeenCalledTimes(1);
    expect(ask).not.toHaveBeenCalled();
  });

  it("routes free text to the default ask action", async () => {
    const ask = vi.fn();
    const cfg = vi.fn();
    const program = makeStubProgram({ ask, cfg });
    await program.parseAsync(["node", "q", "what", "is", "the", "NIS", "score"]);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith("what is the NIS score");
    expect(cfg).not.toHaveBeenCalled();
  });

  it("forwards global flags through interspersed with free text", async () => {
    const ask = vi.fn();
    const cfg = vi.fn();
    const program = makeStubProgram({ ask, cfg });
    // -m before the query words; commander collects the rest into [query...].
    await program.parseAsync(["node", "q", "-m", "gpt-4o", "explain", "this"]);
    expect(ask).toHaveBeenCalledWith("explain this");
    expect(program.opts()["model"]).toBe("gpt-4o");
  });
});

describe("collectGlobalFlags", () => {
  function parseGlobals(args: string[]): GlobalFlags {
    const program = new Command("q");
    program.allowExcessArguments(true).exitOverride();
    addGlobalOptions(program);
    program.argument("[query...]").action(() => {});
    program.parse(["node", "q", ...args]);
    return collectGlobalFlags(program);
  }

  it("does NOT forward negatable booleans when the user did not set them", () => {
    // Critical: commander defaults --no-tools to tools:true. We must not forward
    // that, or it would clobber a configured features.tools=false.
    const flags = parseGlobals(["hello"]);
    expect(flags.tools).toBeUndefined();
    expect(flags.stream).toBeUndefined();
    expect(flags.think).toBeUndefined();
    expect(flags.phrase).toBeUndefined();
  });

  it("forwards --no-tools as tools:false only when explicitly passed", () => {
    const flags = parseGlobals(["--no-tools", "hello"]);
    expect(flags.tools).toBe(false);
  });

  it("forwards --model and --json when set", () => {
    const flags = parseGlobals(["-m", "gpt-4o", "--json", "hi"]);
    expect(flags.model).toBe("gpt-4o");
    expect(flags.json).toBe(true);
  });

  it("forwards --think and --no-stream", () => {
    const flags = parseGlobals(["--think", "--no-stream", "hi"]);
    expect(flags.think).toBe(true);
    expect(flags.stream).toBe(false);
  });
});

describe("toAskParams", () => {
  it("maps --json to format json and only forwards set flags", () => {
    const flags: GlobalFlags = { json: true, model: "gpt-4o" };
    const params = toAskParams("hi", flags);
    expect(params).toEqual({ question: "hi", model: "gpt-4o", format: "json" });
  });

  it("forwards negated booleans (tools/think/phrase) when present", () => {
    const flags: GlobalFlags = { tools: false, think: true, phrase: false };
    const params = toAskParams("hi", flags);
    expect(params.tools).toBe(false);
    expect(params.think).toBe(true);
    expect(params.phrase).toBe(false);
  });

  it("omits unset optional flags so the engine can use config defaults", () => {
    const params = toAskParams("hi", {});
    expect(params).toEqual({ question: "hi" });
  });

  it("passes dryRun through", () => {
    const params = toAskParams("hi", { dryRun: true });
    expect(params.dryRun).toBe(true);
  });

  it("--json overrides an explicit --format text", () => {
    const params = toAskParams("hi", { json: true, format: "text" });
    expect(params.format).toBe("json");
  });
});
