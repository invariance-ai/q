import { render } from "ink";
import { createEngine } from "../engine/engine.js";
import { App } from "./App.js";
import type { Turn } from "../engine/types.js";
import {
  newSession,
  loadSession,
  latestSession,
  resolveSessionId,
  saveSession,
  type ChatSession,
} from "./sessions.js";

export interface RunChatOptions {
  model?: string;
  /** Resume a specific session by id (or unique prefix). */
  resume?: string;
  /** Resume the most recent session. */
  continueLatest?: boolean;
}

/**
 * Entry point for `q chat`. Builds the real engine, optionally resumes a saved
 * session, renders the Ink app, and persists the transcript as it grows.
 */
export async function runChat(opts: RunChatOptions = {}): Promise<void> {
  const engine = createEngine();
  const models = engine.listModels();
  const tools = engine.listTools();

  // Resolve a session to resume, if any.
  let resumed: ChatSession | undefined;
  if (opts.resume) {
    const id = resolveSessionId(opts.resume);
    resumed = id ? loadSession(id) : undefined;
    if (!resumed) {
      process.stderr.write(`no session matching "${opts.resume}"; starting a new one\n`);
    }
  } else if (opts.continueLatest) {
    resumed = latestSession();
    if (!resumed) process.stderr.write("no previous session; starting a new one\n");
  }

  const initialModel = opts.model ?? resumed?.model ?? models[0] ?? "gpt-4o-mini";
  const session: ChatSession = resumed ?? newSession(initialModel);
  const initialHistory: Turn[] = resumed?.turns ?? [];

  const onPersist = (turns: Turn[], model: string): void => {
    session.turns = turns;
    session.model = model;
    saveSession(session);
  };

  const { waitUntilExit } = render(
    <App
      engine={engine}
      initialModel={initialModel}
      models={models}
      tools={tools}
      initialHistory={initialHistory}
      onPersist={onPersist}
    />,
    { exitOnCtrlC: false },
  );

  try {
    await waitUntilExit();
  } catch {
    // Ink throws if the stream is torn down abruptly (e.g. piped/non-TTY).
    // Swallow so `q chat` exits cleanly.
  }
}
