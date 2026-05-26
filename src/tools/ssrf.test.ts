import { describe, it, expect } from "vitest";
import { ToolEntrySchema } from "../config/schema.js";
import { executeTool } from "./execute.js";
import { isBlockedAddress, type LookupFn } from "./ssrf.js";

/** Records the URL/init the fetch was (or wasn't) called with. */
function makeFetchStub(
  capture: (url: string, init: RequestInit) => void,
  response?: { status: number; body: string; headers?: Record<string, string> },
): typeof fetch {
  const r = response ?? { status: 200, body: "ok" };
  return (async (input: string | URL, init?: RequestInit) => {
    capture(String(input), init ?? {});
    return new Response(r.body, { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
}

/** A resolver that maps any name to one public IP (network-free tests). */
const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];

describe("isBlockedAddress", () => {
  it("blocks loopback, link-local, private, unique-local, unspecified", () => {
    for (const ip of [
      "127.0.0.1",
      "127.5.5.5",
      "169.254.169.254",
      "169.254.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "0.0.0.0",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700::1111"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

describe("executeTool SSRF guard", () => {
  function tool(url: string, extra: Record<string, unknown> = {}) {
    return ToolEntrySchema.parse({ name: "t", description: "d", url, ...extra });
  }

  it("blocks http://127.0.0.1/ by default", async () => {
    let called = false;
    const stub = makeFetchStub(() => {
      called = true;
    });
    const res = await executeTool(tool("http://127.0.0.1/"), {}, { fetchImpl: stub });
    expect(res.ok).toBe(false);
    expect(res.status).toBeUndefined();
    expect(res.body).toContain("blocked");
    expect(called).toBe(false);
  });

  it("blocks the cloud-metadata endpoint", async () => {
    const stub = makeFetchStub(() => {});
    const res = await executeTool(
      tool("http://169.254.169.254/latest/meta-data/"),
      {},
      { fetchImpl: stub },
    );
    expect(res.ok).toBe(false);
    expect(res.body).toContain("blocked");
  });

  it("blocks a private RFC1918 address", async () => {
    const stub = makeFetchStub(() => {});
    const res = await executeTool(tool("http://10.0.0.1/"), {}, { fetchImpl: stub });
    expect(res.ok).toBe(false);
    expect(res.body).toContain("blocked");
  });

  it("blocks a DNS name that resolves to a private address", async () => {
    const rebind: LookupFn = async () => [{ address: "10.1.2.3", family: 4 }];
    const stub = makeFetchStub(() => {});
    const res = await executeTool(
      tool("https://evil.example.com/"),
      {},
      { fetchImpl: stub, lookupFn: rebind },
    );
    expect(res.ok).toBe(false);
    expect(res.body).toContain("blocked");
  });

  it("allows a public host", async () => {
    let seenUrl = "";
    const stub = makeFetchStub((u) => {
      seenUrl = u;
    });
    const res = await executeTool(
      tool("https://public.example.com/data"),
      {},
      { fetchImpl: stub, lookupFn: publicLookup },
    );
    expect(res.ok).toBe(true);
    expect(seenUrl).toBe("https://public.example.com/data");
  });

  it("allows a literal public IP without DNS", async () => {
    let seenUrl = "";
    const stub = makeFetchStub((u) => {
      seenUrl = u;
    });
    const res = await executeTool(tool("http://93.184.216.34/"), {}, { fetchImpl: stub });
    expect(res.ok).toBe(true);
    expect(seenUrl).toBe("http://93.184.216.34/");
  });

  it("permits a private host when allowPrivateNetwork is true", async () => {
    let seenUrl = "";
    const stub = makeFetchStub((u) => {
      seenUrl = u;
    });
    const res = await executeTool(
      tool("http://10.0.0.1/internal", { allowPrivateNetwork: true }),
      {},
      { fetchImpl: stub },
    );
    expect(res.ok).toBe(true);
    expect(seenUrl).toBe("http://10.0.0.1/internal");
  });
});

describe("executeTool contextual encoding", () => {
  it("URL-encodes interpolated path values", async () => {
    let seenUrl = "";
    const stub = makeFetchStub((u) => {
      seenUrl = u;
    });
    const entry = ToolEntrySchema.parse({
      name: "t",
      description: "d",
      url: "https://api.example.com/{{input.seg}}",
      input: { seg: { type: "string", required: true } },
    });
    const res = await executeTool(
      entry,
      { seg: "a/b c" },
      { fetchImpl: stub, lookupFn: publicLookup },
    );
    expect(res.ok).toBe(true);
    expect(seenUrl).toBe("https://api.example.com/a%2Fb%20c");
  });

  it("neutralizes path traversal in interpolated values", async () => {
    let seenUrl = "";
    const stub = makeFetchStub((u) => {
      seenUrl = u;
    });
    const entry = ToolEntrySchema.parse({
      name: "t",
      description: "d",
      url: "https://api.example.com/svc/{{input.service}}",
      input: { service: { type: "string", required: true } },
    });
    await executeTool(
      entry,
      { service: "../../admin" },
      { fetchImpl: stub, lookupFn: publicLookup },
    );
    expect(seenUrl).toBe("https://api.example.com/svc/..%2F..%2Fadmin");
  });

  it("strips CR/LF from header values to prevent header injection", async () => {
    let headers: Record<string, string> = {};
    const stub = makeFetchStub((_u, init) => {
      headers = (init.headers as Record<string, string>) ?? {};
    });
    const entry = ToolEntrySchema.parse({
      name: "t",
      description: "d",
      url: "https://api.example.com/",
      headers: { "X-Trace": "{{input.t}}" },
      input: { t: { type: "string", required: true } },
    });
    await executeTool(
      entry,
      { t: "abc\r\nX-Injected: 1" },
      { fetchImpl: stub, lookupFn: publicLookup },
    );
    expect(headers["X-Trace"]).toBe("abcX-Injected: 1");
  });
});

describe("executeTool redirects + input validation", () => {
  it("refuses to follow a 302 redirect", async () => {
    const stub = makeFetchStub(() => {}, {
      status: 302,
      body: "",
      headers: { location: "http://attacker.example.com/" },
    });
    const entry = ToolEntrySchema.parse({
      name: "t",
      description: "d",
      url: "https://api.example.com/",
    });
    const res = await executeTool(entry, {}, { fetchImpl: stub, lookupFn: publicLookup });
    expect(res.ok).toBe(false);
    expect(res.body).toContain("blocked redirect");
    expect(res.body).toContain("attacker.example.com");
  });

  it("rejects when a required input is missing", async () => {
    let called = false;
    const stub = makeFetchStub(() => {
      called = true;
    });
    const entry = ToolEntrySchema.parse({
      name: "t",
      description: "d",
      url: "https://api.example.com/{{input.id}}",
      input: { id: { type: "string", required: true } },
    });
    const res = await executeTool(entry, {}, { fetchImpl: stub, lookupFn: publicLookup });
    expect(res.ok).toBe(false);
    expect(res.body).toBe("missing required input: id");
    expect(called).toBe(false);
  });

  it("drops unknown keys so they can't be interpolated", async () => {
    let seenUrl = "";
    const stub = makeFetchStub((u) => {
      seenUrl = u;
    });
    const entry = ToolEntrySchema.parse({
      name: "t",
      description: "d",
      url: "https://api.example.com/{{input.id}}",
      query: { evil: "{{input.evil}}" },
      input: { id: { type: "string", required: true } },
    });
    await executeTool(
      entry,
      { id: "1", evil: "pwned" },
      { fetchImpl: stub, lookupFn: publicLookup },
    );
    expect(seenUrl).toBe("https://api.example.com/1?evil=");
  });
});
