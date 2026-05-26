import ora, { type Ora } from "ora";

/** Minimal control surface so callers can no-op without branching. */
export interface QSpinner {
  start(text?: string): QSpinner;
  stop(): QSpinner;
  succeed(text?: string): QSpinner;
  fail(text?: string): QSpinner;
  set text(value: string);
}

class NoopSpinner implements QSpinner {
  start(): QSpinner {
    return this;
  }
  stop(): QSpinner {
    return this;
  }
  succeed(): QSpinner {
    return this;
  }
  fail(): QSpinner {
    return this;
  }
  set text(_value: string) {
    /* no-op */
  }
}

class OraSpinner implements QSpinner {
  private readonly inner: Ora;
  constructor(text: string) {
    this.inner = ora({ text, stream: process.stderr });
  }
  start(text?: string): QSpinner {
    this.inner.start(text);
    return this;
  }
  stop(): QSpinner {
    this.inner.stop();
    return this;
  }
  succeed(text?: string): QSpinner {
    this.inner.succeed(text);
    return this;
  }
  fail(text?: string): QSpinner {
    this.inner.fail(text);
    return this;
  }
  set text(value: string) {
    this.inner.text = value;
  }
}

/**
 * A thin `ora` wrapper that becomes a no-op when there is no TTY or when JSON
 * output is requested (so spinner frames never corrupt machine-readable output
 * or piped logs). Renders to stderr to keep stdout clean.
 */
export function makeSpinner(text: string, opts?: { json?: boolean }): QSpinner {
  if (opts?.json || !process.stdout.isTTY) {
    return new NoopSpinner();
  }
  return new OraSpinner(text);
}
