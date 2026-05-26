import type { Command } from "commander";
import chalk from "chalk";

const SAFFRON = "#f4a020";

/** Color helper that degrades to plain text on non-TTY / NO_COLOR. */
function brand(s: string): string {
  return chalk.hex(SAFFRON)(s);
}

function banner(): string {
  return `${brand("q")} ${chalk.dim("— ask anything in your terminal")}`;
}

function quickstart(): string {
  const head = chalk.bold("Quickstart");
  const ex = (cmd: string, note: string) => `  ${brand(cmd.padEnd(34))} ${chalk.dim(note)}`;
  return [
    head,
    ex("q what is the NIS score", "one-shot question"),
    ex("q chat", "interactive session"),
    ex("q tools add --example web_fetch", "register an HTTP tool"),
    ex("q flag", "mark the last answer wrong"),
  ].join("\n");
}

function commandSections(): string {
  const section = (title: string) => chalk.bold(title);
  const ex = (cmd: string, note: string) => `  ${cmd.padEnd(34)} ${chalk.dim(note)}`;
  return [
    "",
    section("Ask"),
    ex("q <question>", 'e.g. q "summarize the changelog"'),
    ex("q ask --json <question>", "machine-readable answer"),
    "",
    section("Chat"),
    ex("q chat", "interactive REPL (needs a TTY)"),
    "",
    section("Tools"),
    ex("q tools list", "show registered HTTP tools"),
    ex("q tools add --example web_fetch", "seed a tool from an example"),
    ex("q tools test <name> --input k=v", "invoke a tool directly"),
    "",
    section("Config"),
    ex("q config list", "print resolved config (redacted)"),
    ex("q model set <id>", "switch the default model"),
    ex("q feature stream off", "toggle a feature flag"),
    "",
    section("Feedback"),
    ex("q flag --disable-pattern", "disable the pattern that mis-routed"),
    "",
    chalk.dim("Run `q help <tools|regex|models|keys>` for deep dives."),
  ].join("\n");
}

export function configureHelp(program: Command): void {
  program
    .description("Ask a question in your terminal and get the answer back.")
    .addHelpText("beforeAll", () => `\n${banner()}\n\n${quickstart()}\n`)
    .addHelpText("after", () => commandSections());
}

const TOPICS: Record<string, () => string> = {
  tools: () =>
    [
      chalk.bold("Registering an HTTP API as a tool"),
      "",
      "A tool is an HTTP endpoint the model can call. Register one with:",
      brand("  q tools add \\"),
      "    --name nis_score \\",
      "    --url https://api.example.com/nis/{entity} \\",
      "    --method GET \\",
      '    --desc "Look up the NIS score for an entity" \\',
      "    --auth-type bearer --auth-env NIS_API_TOKEN \\",
      '    --match "nis score for {entity}"',
      "",
      chalk.bold("Auth"),
      "  We never store secrets. --auth-env names the environment variable that",
      "  holds the token (e.g. NIS_API_TOKEN). Use --auth-type header with",
      "  --header-name X-Api-Key for non-bearer schemes.",
      "",
      chalk.bold("Match patterns"),
      "  --match adds a fast-path: if your question matches the phrase, q calls the",
      "  tool directly without a round-trip to the model. {placeholder} segments",
      "  become tool inputs. See `q help regex` for phrase vs regex syntax.",
    ].join("\n"),
  regex: () =>
    [
      chalk.bold("Phrase vs regex match patterns"),
      "",
      chalk.bold("phrase") + " (default) — a natural example with {placeholders}:",
      '    "nis score for {entity}"',
      "  Matches case-insensitively, tolerates collapsed whitespace and trailing",
      "  punctuation. Each {name} becomes a named tool input.",
      "",
      chalk.bold("regex") + " — a raw regular expression with named groups:",
      "    ^nis(?:\\s+score)?\\s+for\\s+(?<entity>.+)$",
      "  Named groups (?<entity>...) map to tool inputs of the same name.",
      "",
      "If a regex fast-path matches, q can optionally phrase the raw tool result",
      "through the model (feature regexPhraseWithLLM, --phrase / --no-phrase).",
    ].join("\n"),
  models: () =>
    [
      chalk.bold("Switching and defaulting the model"),
      "",
      "  q model              show the current default + its provider",
      "  q model list         list known models, current marked",
      "  q model set <id>     set the default (provider must be resolvable)",
      "",
      "Per-call override: q --model <id> <question>  (or -m).",
      "The provider (anthropic | openai) is inferred from the model id.",
    ].join("\n"),
  keys: () =>
    [
      chalk.bold("Providing API keys"),
      "",
      "Two sources, in priority order:",
      chalk.bold("  1. Environment variables (always win):"),
      "       ANTHROPIC_API_KEY, OPENAI_API_KEY",
      chalk.bold("  2. Config file:"),
      "       q config set keys.anthropic sk-ant-...",
      "       q config set keys.openai sk-...",
      "",
      "Env-sourced keys are never written back to disk. `q config list` and",
      "`q config get` redact secrets in their output.",
    ].join("\n"),
  telemetry: () =>
    [
      chalk.bold("Anonymous, opt-in telemetry"),
      "",
      "Telemetry is OFF by default. q asks once, politely, and never again if you",
      "decline. Control it anytime:",
      "  q telemetry on | off | status",
      "",
      chalk.bold("What is sent (only when enabled):"),
      "  a random anon id, which command ran, regex-vs-model routing, provider,",
      "  model, q version, OS, and coarse timing/error class.",
      chalk.bold("What is never sent:"),
      "  your questions or answers, tool URLs or responses, file contents,",
      "  environment variables, or API keys.",
      "",
      "Hard-disable regardless of config: set Q_NO_TELEMETRY=1 (or DO_NOT_TRACK=1).",
      "Events are appended to an insert-only table; the embedded key cannot read them.",
    ].join("\n"),
};

export function registerHelpTopics(program: Command): void {
  program
    .command("help [topic]")
    .description("Show help, or a deep-dive on: tools, regex, models, keys, telemetry")
    .action((topic?: string) => {
      if (!topic) {
        program.outputHelp();
        return;
      }
      const render = TOPICS[topic];
      if (!render) {
        process.stderr.write(
          chalk.yellow(`unknown help topic "${topic}". Try: ${Object.keys(TOPICS).join(", ")}`) +
            "\n",
        );
        process.exitCode = 1;
        return;
      }
      process.stdout.write(render() + "\n");
    });
}
