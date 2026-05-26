# q as an OpenAI / Codex function tool

`q-tool.json` is a ready-to-paste OpenAI-style function definition for a single
`q_ask` tool. Drop it into your `tools` array and your agent can query every
internal API your team has registered — `q` routes to the right endpoint and
injects auth, so this one ~10-line def replaces N per-endpoint tool schemas.

## Handler

When the model calls `q_ask`, run `q --json` and return the `answer`:

```js
import { execFileSync } from "node:child_process";

function qAsk({ question }) {
  const out = execFileSync("q", ["--json", question], { encoding: "utf8" });
  const { answer, toolCalls, routedVia } = JSON.parse(out);
  return answer; // toolCalls[].tool tells you the source; routedVia is "regex" | "llm"
}
```

Requires `q` installed (`npm i -g @invariance/q`) and on `PATH`, with the
team's endpoints registered (`q tools add …`) and auth env vars set.
