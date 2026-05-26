import { render } from "ink";
import { createEngine } from "../engine/engine.js";
import { App } from "./App.js";

export interface RunChatOptions {
  model?: string;
}

/**
 * Entry point for `q chat`. Builds the real engine via Agent A's factory,
 * resolves the initial model, renders the Ink app, and waits for exit.
 */
export async function runChat(opts: RunChatOptions = {}): Promise<void> {
  const engine = createEngine();
  const models = engine.listModels();
  const tools = engine.listTools();
  const initialModel = opts.model ?? models[0] ?? "gpt-4o-mini";

  const { waitUntilExit } = render(
    <App engine={engine} initialModel={initialModel} models={models} tools={tools} />,
    { exitOnCtrlC: false },
  );

  try {
    await waitUntilExit();
  } catch {
    // Ink throws if the stream is torn down abruptly (e.g. piped/non-TTY).
    // Swallow so `q chat` exits cleanly.
  }
}
