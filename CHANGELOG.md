# Changelog

## 0.1.0 (unreleased)

Initial release.

- `q <question>` — quote-free one-shot ask, streamed.
- Multi-provider LLMs (Anthropic + OpenAI); switchable default model (`gpt-4o-mini`).
- User-registered HTTP API tools with templated url/query/headers/body and env-var auth.
- Regex/phrase fast-path routing (`--match`); `--no-phrase` for zero-model, deterministic answers.
- `q flag` feedback loop to correct mis-routed answers.
- Polished interactive chat (`q` / `q chat`) with slash commands
  (`/model`, `/tools`, `/sessions`, `/new`, `/retry`, `/think`, `/flag`, `/clear`, `/help`, `/exit`).
- Saved, resumable chat sessions: `q sessions list|show|rm`, `q chat --resume/--continue`.
- Shareable registry: `q tools export` / `q tools import <file|url>`.
- Agent interface: Claude Code skill, MCP server, and Codex tool def under `examples/`.
- Security: SSRF guard (blocks private/link-local/metadata addresses by default;
  opt in per tool with `allowPrivateNetwork`), URL-encoded interpolation, manual redirects,
  typed input validation, secret redaction.
- Opt-in anonymous telemetry (off by default; `q telemetry on|off|status`, `Q_NO_TELEMETRY`).
