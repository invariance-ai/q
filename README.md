<div align="center">

# q

**Turn your internal APIs into instant terminal answers — for you and your agents.**

</div>

```console
$ q deploy status for checkout-service
checkout-service: v2.3.1 live, rolled out 4m ago   ·  source: deploy_status
```

You registered the `deploy_status` endpoint once. Now anyone — a teammate at a terminal, or an AI agent — asks for it in plain English and gets the answer back. When the question matches a pattern, `q` calls your API directly (no model needed to decide *which* tool); when it doesn't, a model reasons over your registered tools and picks one.

The same registry powers both audiences: humans skip the dashboard, and **agents get a single `q(question)` tool instead of one hand-written schema per endpoint** — your internal API surface never enters their context.

```console
$ q tools add \
    --name deploy_status \
    --desc "Latest deploy status for a service" \
    --url 'https://api.internal.example.com/deploys/{{input.service}}/latest' \
    --auth-type bearer --auth-env DEPLOY_API_TOKEN \
    --match 'deploy status for {service}'

$ q deploy status for checkout-service     # matched a pattern → calls your API directly
$ q which services are failing health checks   # no match → the model reasons over your tools
```

## Install

```sh
npm i -g @invariance/q
```

Node ≥ 20. This installs a command named **`q`**. If that name is already taken on your `$PATH` (e.g. Amazon Q's `q`), alias it instead — `alias iq='q'` — or rename the symlink npm creates.

```sh
export OPENAI_API_KEY=sk-...     # default model is gpt-4o-mini
q deploy status for checkout-service
```

(Anthropic works too — set `ANTHROPIC_API_KEY` and `q model set claude-opus-4-7`. Provider is inferred from the model id.)

> **Shell quoting:** bare questions work great, but `zsh` treats a trailing `?` or `*` as a filename glob and aborts before `q` runs (`zsh: no matches found`). Fix it once — add `alias q='noglob q'` to your `~/.zshrc` — and `q how does this work?` just works. (Apostrophes still need quotes: `q "what's up"`.)
>
> **Pipe input in:** `q` reads stdin, so `git diff | q what's risky here` or `cat error.log | q summarize the failures` folds the piped text into your question.

## Registering an API as a tool

A tool is an HTTP endpoint plus a one-line description of when to use it. The model reads the description to decide when to call it; you read the response in plain language.

```sh
q tools add \
  --name oncall \
  --desc "Who is currently on call for a team" \
  --url 'https://api.internal.example.com/oncall?team={{input.team}}' \
  --method GET \
  --auth-type bearer --auth-env PAGERDUTY_TOKEN \
  --match 'who is on call for {team}'
```

- **Templates** — `url`, `query`, `headers`, and `body` interpolate `{{input.x}}` (filled by a pattern or the model) and `{{env.X}}` (your environment). Values are URL-encoded into paths/queries.
- **Auth** — `--auth-type bearer|header --auth-env PAGERDUTY_TOKEN` reads the token from that env var at call time. The token is **never stored** — only the variable's name is.
- **Safety** — `q` blocks requests to private/link-local/metadata addresses by default (opt in per tool with `allowPrivateNetwork`), encodes interpolated inputs, and refuses to follow redirects that could leak your token.
- **Manage** — `q tools list · test <name> --input k=v · enable · disable · remove`.

Full reference: `q help tools`.

### Share the registry with your team

The registry is portable and secret-free (it stores env-var *names*, not tokens), so you can check it into a repo and share it:

```sh
q tools export --file team-tools.json   # commit this
q tools import team-tools.json           # teammates / CI pull it in
q tools import https://example.com/team-tools.json
```

## Zero-latency routing (the `--match` part)

A `--match` pattern sends a matching question straight to the tool — no model round-trip to decide *which* tool.

```sh
--match 'deploy status for {service}'     # phrase: {name} captures an input
--match '/^oncall (?<team>[\w-]+)$/'       # raw regex with named groups
```

Phrase patterns are forgiving — case-insensitive, whitespace-tolerant, trailing punctuation ignored. By default `q` then phrases the raw API response into a sentence with the model; add `--no-phrase` (or `q feature regexPhraseWithLLM off`) to return the raw result with **zero model calls** — fully deterministic and offline. The cite line (`source: <tool>`) always tells you where an answer came from.

Mis-routed?

```sh
q flag the oncall lookup hit the wrong team   # log it
q flag --disable-pattern                       # and stop that pattern from matching
```

## Use q from your agents

Register your internal APIs in `q` once, then hand any agent a **single** tool — `q(question)` — instead of writing (and maintaining) one MCP/tool schema per endpoint. The agent asks in plain English; `q` picks the endpoint, injects auth, and returns the answer. No endpoint schemas leak into the agent's context, and common queries skip the model entirely via the fast-path.

`q --json` returns `{ answer, error, toolCalls, routedVia, model, usage }`. **Output contract:** when a tool call fails, `error` is set, `toolCalls[].ok` is `false`, and the process exits non-zero — gate on `error`/exit, don't relay `answer` blindly. Wire it up in a few lines:

- **Claude Code** — drop-in skill: [`examples/claude-code-skill/`](./examples/claude-code-skill/)
- **Any MCP client** (Claude Desktop, …) — one-file stdio server: [`examples/mcp/`](./examples/mcp/)
- **OpenAI / Codex** — ~10-line function tool def: [`examples/codex/`](./examples/codex/)

## Current info (web search, on by default)

Plain questions are answered by a **web-search model by default**, so current
events and "what's the date" just work, with citations:

```sh
q whats the latest on the openai funding round    # live, cited
q --no-web explain promise.allSettled             # skip search, plain model
q -m sonar-pro <question>                          # Perplexity, if you have a key
```

Defaults: `webModel = gpt-4o-mini-search-preview` (works with your OpenAI key).
When you've **registered internal-API tools**, those take priority (tool-calling
needs a regular model); use `--web` to force a web answer. Turn the default off
with `q feature web off`. Other web backends: set `q config set webModel sonar`
(Perplexity), or register a search API like [Nia](https://www.trynia.ai/) as a
normal tool for deep research.

## General questions & chat

`q` also answers ordinary questions (no tools required), and `--json` makes it scriptable:

```sh
q explain this stack trace
# scripts: check .error before trusting .answer (and `q` exits non-zero on failure)
q --json "summarize the git log since v1.2" | jq -r '.error // .answer'
```

Run `q` with no arguments (or `q chat`) for a multi-turn session with live streaming. Conversations are saved locally and resumable:

```sh
q sessions list            # recent chats: when · model · first message
q chat --continue          # pick up the most recent conversation
q chat --resume <id>       # resume a specific one
```

In-chat slash commands: `/model [id]` · `/tools` · `/sessions` · `/new` · `/retry` · `/think` · `/flag [note]` · `/clear` · `/help` · `/exit`.

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

## Privacy & security

Anonymous usage telemetry is **opt-in and off by default**. `q` asks once, politely, and never again if you decline. Toggle with `q telemetry on|off|status`; hard-disable with `Q_NO_TELEMETRY=1`. It never sends your questions, answers, tool URLs, responses, or keys — only coarse signals like which command ran and whether routing was regex or model. See `q help telemetry`.

`q` redacts API keys and bearer tokens from anything it prints or logs, blocks tool calls to private/internal network addresses by default, URL-encodes interpolated inputs, and won't follow token-leaking redirects.

## Help

```sh
q help                 # overview + quickstart
q help tools           # registering APIs, auth, sharing
q help regex           # match patterns and {placeholders}
```

---

MIT licensed. Built by [Invariance](https://github.com/invariance-ai). Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).
