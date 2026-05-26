# q as an OpenAI / Codex function tool

`q-tool.json` is a ready-to-paste OpenAI-style function definition for a single
`q_ask` tool. Drop it into your `tools` array and your agent can query every
internal API your team has registered — `q` routes to the right endpoint and
injects auth, so this one ~10-line def replaces N per-endpoint tool schemas.

## Handler

When the model calls `q_ask`, run `q --json` and return the `answer`. Handle
failure explicitly: `q` exits non-zero when it can't answer (no key, no match),
and a tool-level failure surfaces as `toolCalls[].ok === false` even on a zero
exit — relaying that blindly would hand the agent an error as if it were the
answer.

```js
import { execFile } from "node:child_process";

function qAsk({ question }) {
  return new Promise((resolve) => {
    execFile("q", ["--json", question], { encoding: "utf8" }, (err, stdout) => {
      if (err && !stdout) {
        resolve(`q failed: ${err.message}`); // non-zero exit, empty stdout
        return;
      }
      let res;
      try {
        res = JSON.parse(stdout);
      } catch {
        resolve("q returned unparseable output");
        return;
      }
      // A tool call can fail while the process still exits 0 — check `ok`.
      if (res.toolCalls?.some((t) => t.ok === false)) {
        resolve(`q tool error: ${res.answer}`);
        return;
      }
      resolve(res.answer); // toolCalls[].tool = source; routedVia = "regex" | "llm"
    });
  });
}
```

Requires `q` installed (`npm i -g @invariance/q`) and on `PATH` as the literal
command `q` (a shell `alias` won't work for `execFile`). Register the team's
endpoints (`q tools add …`) and set their auth env vars.
