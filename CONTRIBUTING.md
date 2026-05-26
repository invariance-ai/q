# Contributing to q

Thanks for hacking on `q`. This doc covers the layout and local workflow.

## Setup

```sh
pnpm install
pnpm typecheck && pnpm test && pnpm build
node dist/index.js what is 2+2
pnpm tsx fixtures/echo-server.ts   # a local server for testing registered tools
```

Requires Node ≥ 20. The package is ESM, built with `tsup`, tested with `vitest`.

## Architecture

```
q <question>
   │
   ├─ CLI (commander)  — quote-free routing, global flags, help, subcommands
   │
   └─ QEngine (the contract every surface shares: src/engine/types.ts)
        ├─ regex/phrase fast-path  → execute a tool directly (optional LLM phrasing)
        ├─ provider abstraction    → Anthropic | OpenAI (streaming, tools, thinking)
        ├─ tool-calling loop       → model picks a registered HTTP tool, q calls it
        ├─ tool registry + executor→ templated url/query/headers/body, env-var auth
        └─ feedback + telemetry    → local last-run record, opt-in anonymous events
```

The one-shot path is dependency-light and never imports the chat UI. The chat
UI (Ink + React) is lazy-loaded only when you open a session, so single
questions stay fast.

### Key modules

- `src/engine/types.ts` — the `QEngine` contract. Load-bearing; the CLI, the
  one-shot renderer, and the chat UI all depend on it. Change deliberately.
- `src/config/schema.ts` — zod schemas for config + the tool registry.
- `src/engine/engine.ts` — `createEngine()`; regex fast-path → tool-calling loop.
- `src/providers/*` — provider-neutral `Provider.run()` adapters.
- `src/tools/*` — registry, templated HTTP execution, provider-tool translation.
- `src/chat/*` — the Ink chat UI; `runChat.tsx` is the lazy entry point.

## Conventions

- ESM with `.js` extensions on relative imports.
- TypeScript strict + `noUncheckedIndexedAccess`.
- Run `pnpm typecheck && pnpm test` before opening a PR; CI runs the same.
- Secrets must pass through `redact()` at every echo/log boundary.

## Telemetry

The Supabase schema for anonymous CLI telemetry lives in the Invariance
platform repo (`cli_telemetry_events`, insert-only via the anon role). The
client only ever appends events; it cannot read them.
