import { describe, it, expect } from "vitest";
import { ToolEntrySchema } from "../config/schema.js";
import { executeTool, toToolCallRecord } from "./execute.js";

function makeFetchStub(
  capture: (url: string, init: RequestInit) => void,
  response: { ok: boolean; status: number; body: string },
): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    capture(String(input), init ?? {});
    return new Response(response.body, { status: response.status });
  }) as unknown as typeof fetch;
}

describe("executeTool", () => {
  it("interpolates url + query and returns the body", async () => {
    let seenUrl = "";
    const entry = ToolEntrySchema.parse({
      name: "t",
      description: "d",
      url: "https://api.test/{{input.id}}",
      query: { q: "{{input.q}}" },
      input: { id: { type: "string" }, q: { type: "string" } },
    });
    const stub = makeFetchStub(
      (u) => {
        seenUrl = u;
      },
      { ok: true, status: 200, body: "hello" },
    );
    const res = await executeTool(
      entry,
      { id: "42", q: "x y" },
      { fetchImpl: stub },
    );
    expect(seenUrl).toBe("https://api.test/42?q=x+y");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.body).toBe("hello");
  });

  it("injects bearer auth from env", async () => {
    process.env["TEST_TOKEN"] = "secrettoken";
    let headers: Record<string, string> = {};
    const entry = ToolEntrySchema.parse({
      name: "t",
      description: "d",
      url: "https://api.test/",
      auth: { type: "bearer", envVar: "TEST_TOKEN" },
    });
    const stub = makeFetchStub(
      (_u, init) => {
        headers = (init.headers as Record<string, string>) ?? {};
      },
      { ok: true, status: 200, body: "ok" },
    );
    await executeTool(entry, {}, { fetchImpl: stub });
    expect(headers["Authorization"]).toBe("Bearer secrettoken");
    delete process.env["TEST_TOKEN"];
  });

  it("returns ok:false instead of throwing on network error", async () => {
    const entry = ToolEntrySchema.parse({
      name: "t",
      description: "d",
      url: "https://api.test/",
    });
    const stub = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const res = await executeTool(entry, {}, { fetchImpl: stub });
    expect(res.ok).toBe(false);
    expect(res.body).toContain("boom");
  });

  it("redacts secrets in the call record preview", () => {
    const rec = toToolCallRecord({
      tool: "t",
      input: {},
      result: { ok: true, status: 200, body: "token=AIzaSyA1234567890abcdefghijklmnop" },
      durationMs: 5,
    });
    expect(rec.resultPreview).not.toContain("AIzaSyA1234567890abcdefghijklmnop");
    expect(rec.resultPreview).toContain("***");
  });
});
