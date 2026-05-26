/**
 * Typed error hierarchy for `q`. Every error carries an `exitCode` so the CLI
 * can exit deterministically. Default exit code is 1.
 */
export class QError extends Error {
  exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "QError";
    this.exitCode = exitCode;
  }
}

export class ConfigError extends QError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = "ConfigError";
  }
}

export class ToolError extends QError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = "ToolError";
  }
}

export class ProviderError extends QError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = "ProviderError";
  }
}

/** Best-effort exit-code extraction for any thrown value. */
export function exitCodeFor(err: unknown): number {
  if (err instanceof QError) return err.exitCode;
  return 1;
}
