# q as an MCP server

A minimal [MCP](https://modelcontextprotocol.io) stdio server that exposes the
`q` CLI as a single tool, `q_ask({ question })`. Any MCP client gets one tool
for all of your internal APIs — `q` picks the right endpoint and injects auth,
so the agent never sees endpoint schemas.

## Prerequisites

- `q` installed and on `PATH`: `npm i -g @invariance/q`
- Your endpoints registered (`q tools add …`) and auth env vars set.

## Install & run

```sh
cd examples/mcp
npm install      # pulls @modelcontextprotocol/sdk (kept out of the q package)
node server.mjs  # speaks MCP over stdio
```

## Register it in an MCP client

Add this to your client's MCP config (e.g. Claude Desktop's
`claude_desktop_config.json`), pointing at the absolute path to `server.mjs`:

```json
{
  "mcpServers": {
    "q": {
      "command": "node",
      "args": ["/absolute/path/to/q/examples/mcp/server.mjs"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "DEPLOY_API_TOKEN": "...",
        "NIS_API_TOKEN": "..."
      }
    }
  }
}
```

The `env` block is where `q` reads the LLM key and the auth env vars your
registered tools reference. Restart the client; the `q_ask` tool appears.
Common questions hit your API directly via the regex fast-path (no model
latency); everything else is routed by the model.
