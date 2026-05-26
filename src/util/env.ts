/**
 * Thin wrapper over process.env so tests can stub/inject without globally
 * mutating the environment in production code paths.
 */
export function getEnv(name: string): string | undefined {
  return process.env[name];
}
