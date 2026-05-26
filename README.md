# q

**Ask a question in your terminal and get the answer back.**

```sh
q what is the capital of France
# Paris
```

`q` routes your question through an LLM (Anthropic or OpenAI) that can call **your own HTTP APIs** as tools — so `q what is the NIS score?` can hit your internal endpoint and answer in plain language. No quotes required, multi-provider with a switchable default model, a deterministic regex/phrase fast-path, a feedback loop, and a polished interactive chat mode.

---

## Install

```sh
npm i -g @invariance/q     # or: pnpm add -g @invariance/q
```

Requires Node ≥ 20. The command is `q`.

## Quickstart

```sh
export OPENAI_API_KEY=sk-...        # or ANTHROPIC_API_KEY
q what is 2 plus 2                  # one-shot, no quotes needed
q chat                             # interactive chat window
q tools add --example web_fetch    # register an HTTP tool
q --json what is the capital of France   # structured output for scripts
```

> **zsh tip:** a trailing `?` is a glob in zsh. Use `q "what is the NIS score?"`, run `noglob q ...`, or add `alias q='noglob q'` to your `~/.zshrc`.

## Configuration

Keys are read from the **environment first**, then an optional config file at `~/.config/q/config.json` (honors `$XDG_CONFIG_HOME`; written `0600`). Environment keys are never written to disk.

| Provider  | Environment variable |
|-----------|----------------------|
| Anthropic | `ANTHROPIC_API_KEY`  |
| OpenAI    | `OPENAI_API_KEY`     |

```sh
q config set keys.openai sk-...    # optional: store a key in the config file
q config get keys.openai           # values are redacted on display
q config path                      # where the config lives
q config list
```

## Models

```sh
q model                  # show the current default + provider
q model list             # known models
q model set claude-opus-4-7
q -m gpt-4o what changed in this repo   # per-question override
```

The provider is inferred from the model id (`claude*`/`anthropic*` → Anthropic, `gpt*`/`o*` → OpenAI). Default model: `gpt-4o-mini`.

## Tools — let `q` call your APIs

Register any HTTP endpoint as a tool. The LLM decides when to call it based on the description; the response feeds back into the answer.

```sh
q tools add \
  --name nis_score \
  --desc "Look up the NIS score for a deploy or entity" \
  --url 'https://api.internal.example.com/nis?entity={{input.entity}}' \
  --method GET \
  --auth-type bearer --auth-env NIS_API_TOKEN \
  --match 'nis score for {entity}'

q "what is the nis score for last week's deploy"
```

- **Templates:** `url`, `query`, `headers`, and `body` support `{{input.x}}` and `{{env.X}}`.
- **Auth:** `--auth-type bearer|header --auth-env NIS_API_TOKEN` injects the secret from that env var at call time (never stored).
- Manage tools: `q tools list | test <name> --input k=v | enable <name> | disable <name> | remove <name>`.

See `q help tools` for the full reference.

## Regex / phrase fast-path

Give a tool a `--match` pattern and matching questions route **directly** to it — deterministic, no LLM round-trip:

```sh
--match 'nis score for {entity}'          # phrase: {name} → captured input
--match '/^deploy (?<id>\d+)$/'           # raw regex with named groups
```

By default the raw tool result is phrased by the LLM; `--no-phrase` (or `q feature regexPhraseWithLLM off`) returns the raw result with zero LLM calls. See `q help regex`.

## Flag a wrong match

If `q` routed a question to the wrong tool/pattern, correct it:

```sh
q flag the place lookup was wrong       # logs feedback on the last answer
q flag --disable-pattern                # also disable the pattern that matched
q flag --right                          # positive signal
```

Feedback is stored locally in `~/.config/q/feedback.jsonl`.

## Chat mode

Run `q` with no arguments (or `q chat`) for a multi-turn session with live streaming, tool-call indicators, and slash commands:

```
/model <id>   switch model      /tools   list tools
/flag [note]  flag last answer  /clear   reset history
/help                           /exit
```

## Feature toggles

```sh
q feature list
q feature tools off            # disable tool-calling (pure LLM Q&A)
q feature stream off           # disable token streaming
q feature think on             # extended thinking
q feature format json          # default output format
```

Per-question flags: `--no-tools`, `--no-stream`, `--think/--no-think`, `--format <markdown|text|json>`, `--json`, `--dry-run`.

## Security

`q` redacts high-confidence secrets (API keys, tokens, `Authorization` headers) from anything it prints or logs. Provider keys read from the environment are never persisted. Tool auth tokens are referenced by env-var name, never stored in the config.

## Development

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm build
node dist/index.js what is 2+2
```

## License

MIT © Invariance. See [LICENSE](./LICENSE).
