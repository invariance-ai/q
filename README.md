<div align="center">

# q

**Turn your internal APIs into instant terminal answers.**

</div>

```console
$ q nis score for last week's deploy
0.82 — up from 0.74   ·  source: nis_score
```

You registered the `nis_score` endpoint once. Now anyone on the team asks for it in plain English and gets the number back — **with zero LLM latency**, because the question matched a pattern and went straight to your API. When nothing matches, a model handles it instead.

That's the whole idea: the metrics, deploy status, on-call info, and feature-flag lookups that today live behind a dozen half-remembered `curl` commands and dashboards become one thing you can just *ask*.

```console
$ q tools add \
    --name nis_score \
    --desc "NIS score for a deploy or entity" \
    --url 'https://api.internal.example.com/nis?entity={{input.entity}}' \
    --auth-type bearer --auth-env NIS_API_TOKEN \
    --match 'nis score for {entity}'

$ q nis score for checkout-service     # → calls your API directly, no model in the loop
$ q which deploy regressed nis this week?   # → no pattern match, so the model reasons over your tools
```

## Install

```sh
npm i -g @invariance/q
```

Node ≥ 20. Set a key and go:

```sh
export OPENAI_API_KEY=sk-...     # default model is gpt-4o-mini
q nis score for checkout-service
```

(Anthropic works too — set `ANTHROPIC_API_KEY` and `q model set claude-opus-4-7`. The provider is inferred from the model id.)

## Registering an API as a tool

A tool is an HTTP endpoint plus a one-line description of when to use it. The model reads the description to decide when to call it; you read the response in plain language.

```sh
q tools add \
  --name deploy_status \
  --desc "Current status of a service's latest deploy" \
  --url 'https://api.internal.example.com/deploys/{{input.service}}/latest' \
  --method GET \
  --auth-type bearer --auth-env DEPLOY_API_TOKEN \
  --match 'deploy status for {service}'
```

- **Templates** — `url`, `query`, `headers`, and `body` interpolate `{{input.x}}` (filled by a pattern or the model) and `{{env.X}}` (your environment).
- **Auth** — `--auth-type bearer|header --auth-env DEPLOY_API_TOKEN` reads the token from that env var at call time. The token is **never stored** — only the variable's name is.
- **Manage** — `q tools list · test <name> --input k=v · enable · disable · remove`.

Full reference: `q help tools`.

## Zero-latency routing (the `--match` part)

A `--match` pattern sends a matching question straight to the tool — no model round-trip to decide *which* tool, no model latency at all if you don't want it.

```sh
--match 'deploy status for {service}'     # phrase: {name} captures an input
--match '/^nis (?<entity>[\w-]+)$/'       # raw regex with named groups
```

Phrase patterns are forgiving — case-insensitive, whitespace-tolerant, trailing punctuation ignored. By default the raw API response is phrased into a sentence by the model; add `--no-phrase` (or `q feature regexPhraseWithLLM off`) to return the raw result with **zero LLM calls** — fully deterministic, works offline. Details: `q help regex`.

When a question *doesn't* match any pattern, `q` hands it to the model with your tools available, and the model picks one if it helps. Either way you get an answer; the cite line (`source: <tool>`) tells you where it came from.

### Got a wrong match? Fix it.

```sh
q flag the deploy lookup hit the wrong service   # log it
q flag --disable-pattern                         # and stop that pattern from matching
```

## Use q from your agents

Register your internal APIs in `q` once, then hand any agent a **single** tool —
`q(question)` — instead of writing one MCP/tool schema per endpoint. The agent
asks in plain English; `q` picks the endpoint, injects auth, and returns the
answer. No endpoint schemas leak to the agent, and common queries skip the model
entirely via the regex fast-path.

`q --json` gives you the structured `answer` plus the `toolCalls` to cite. Wire
it up in a few lines:

- **Claude Code** — drop-in skill: [`examples/claude-code-skill/`](./examples/claude-code-skill/)
- **Any MCP client** (Claude Desktop, …) — one-file stdio server: [`examples/mcp/`](./examples/mcp/)
- **OpenAI / Codex** — ~10-line function tool def: [`examples/codex/`](./examples/codex/)

## General questions & chat

`q` answers ordinary questions too (no tools required):

```sh
q explain this regex: '^\d{3}-\d{4}$'
q --json what is the capital of France     # structured output for scripts
```

Run `q` with no arguments (or `q chat`) for a multi-turn session with live streaming and slash commands (`/model`, `/tools`, `/flag`, `/clear`, `/help`, `/exit`). Conversations are saved locally and resumable:

```sh
q sessions list            # recent chats: when · model · first message
q sessions show <id>       # print a transcript
q chat --continue          # pick up the most recent conversation
q chat --resume <id>       # resume a specific one
```

## Configuration

Keys are read from the environment first, then an optional `~/.config/q/config.json` (created `0600`). Keys found in the environment are never written to disk.

```sh
q config set keys.openai sk-...   # optional; env vars always win
q config path                     # where settings live
q config list                     # everything, secrets redacted
```

Feature toggles (each has a matching per-question flag):

```sh
q feature tools off        # pure Q&A, no tool-calling      (--no-tools)
q feature stream off       # don't stream tokens            (--no-stream)
q feature format json      # default output format          (--format / --json)
```

## Privacy

Anonymous usage telemetry is **opt-in and off by default**. `q` asks once, politely, and never again if you decline. Toggle anytime with `q telemetry on|off|status`; hard-disable with `Q_NO_TELEMETRY=1`. It never sends your questions, answers, tool URLs, responses, or keys — only coarse things like which command ran and whether routing was regex or model. See `q help telemetry`.

`q` also redacts API keys and bearer tokens from anything it prints or logs.

## Help

```sh
q help                 # overview + quickstart
q help tools           # registering APIs, auth, inputs
q help regex           # match patterns and {placeholders}
```

---

MIT licensed. Built by [Invariance](https://github.com/invariance-ai). Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
