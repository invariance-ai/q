#!/usr/bin/env node
// Minimal MCP stdio server that exposes the `q` CLI as a single tool, `q_ask`.
// An MCP client (Claude Desktop, etc.) sees ONE tool; q routes the question to
// the right internal API behind the scenes. Requires `q` installed + on PATH
// (npm i -g @invariance/q) with the team's endpoints registered (`q tools add`).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const exec = promisify(execFile);

const server = new McpServer({ name: "q", version: "0.1.0" });

server.tool(
  "q_ask",
  "Ask the team's internal APIs (metrics, deploys, on-call, feature flags, " +
    "health scores) in plain English. q routes to the right endpoint and " +
    "injects auth; you do not need endpoint schemas.",
  { question: z.string().describe("The question, in plain English.") },
  async ({ question }) => {
    try {
      const { stdout } = await exec("q", ["--json", question], {
        maxBuffer: 10 * 1024 * 1024,
      });
      const result = JSON.parse(stdout);
      return { content: [{ type: "text", text: result.answer ?? stdout }] };
    } catch (err) {
      const detail = err?.stderr || err?.message || String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `q failed: ${detail}` }],
      };
    }
  },
);

await server.connect(new StdioServerTransport());
