---
name: q
description: Answer questions about the team's internal systems and data — metrics, deploy status, on-call rotation, feature flags, NIS/health scores, or anything a user means by "ask our APIs" / "check our internal service". Use whenever a question needs live, private, or account-specific data that the team has registered behind the `q` CLI, rather than general knowledge or the local codebase.
---

# q — ask the team's internal APIs

`q` is a single tool interface to the team's internal data. Endpoints
(metrics, deploys, on-call, feature flags, …) are registered once; you query
them all through one command instead of learning each endpoint's schema.

## How to use it

When the user asks about internal/company data, shell out to:

```sh
q --json "<the user's question, in plain English>"
```

Pass the question through roughly as asked — `q` decides which API to call (a
regex fast-path for common queries, the model otherwise) and injects auth. You
do **not** need endpoint URLs or schemas.

Parse the stdout as JSON and use these fields:

- `answer` — the answer to relay to the user. Lead with this.
- `toolCalls[]` — which internal APIs were hit (`tool`, `ok`, `status`). Cite
  the `tool` name(s) so the user knows the source, e.g. "(source: nis_score)".
- `routedVia` — `"regex"` (fast-path, no model latency) or `"llm"`.

If `toolCalls` is empty, `q` answered from general knowledge or had no matching
tool — say so plainly rather than implying it came from an internal system.

## Example

```sh
$ q --json "deploy status for checkout-service"
```
```json
{
  "answer": "checkout-service: deployed 12m ago, healthy (build 4f1a2).",
  "routedVia": "regex",
  "toolCalls": [{ "tool": "deploy_status", "ok": true, "status": 200 }]
}
```

Relay: "checkout-service deployed 12m ago and is healthy (build 4f1a2). (source: deploy_status)"

## Requirements

- `q` must be installed (`npm i -g @invariance/q`) and on `PATH`.
- The team's endpoints must already be registered (`q tools list` to check) and
  the relevant auth env vars set. If `q tools list` is empty, there is nothing
  internal to query — fall back to normal answering and tell the user.
- A non-zero exit or an error on stderr means `q` couldn't answer (missing key,
  no matching tool); surface that instead of guessing.
