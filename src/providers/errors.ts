import type { ProviderName } from "../engine/types.js";
import { ProviderError } from "../util/errors.js";

/**
 * Map vendor SDK errors to a single friendly ProviderError. We avoid importing
 * vendor error classes (to keep this provider-agnostic) and instead inspect
 * common shapes (status code, name).
 */
export function normalizeProviderError(
  err: unknown,
  provider: ProviderName,
): ProviderError {
  const label = provider === "anthropic" ? "Anthropic" : "OpenAI";
  const envVar = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";

  if (err instanceof ProviderError) return err;

  const anyErr = err as {
    status?: number;
    statusCode?: number;
    name?: string;
    message?: string;
  };
  const status = anyErr?.status ?? anyErr?.statusCode;
  const name = anyErr?.name ?? "";
  const message = anyErr?.message ?? String(err);

  if (status === 401 || status === 403 || /authentication/i.test(name)) {
    return new ProviderError(
      `${label} API key invalid or unauthorized. Check ${envVar} (or \`q config set keys.${provider} <key>\`).`,
    );
  }
  if (status === 429 || /ratelimit/i.test(name)) {
    return new ProviderError(`${label} rate limited. Retry shortly.`);
  }
  if (typeof status === "number" && status >= 400) {
    return new ProviderError(`${label} API error ${status}: ${message}`);
  }
  if (name === "AbortError" || /abort/i.test(message)) {
    return new ProviderError(`${label} request aborted.`);
  }
  return new ProviderError(`${label} request failed: ${message}`);
}
