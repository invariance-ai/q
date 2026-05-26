/**
 * Telemetry transport. Appends anonymous events to an insert-only Supabase
 * table in the Invariance project. The embedded key is a *publishable* (anon)
 * key — public by design — and Row-Level Security restricts it to INSERT only,
 * so it can never read events back. Sends are fire-and-forget with a short
 * timeout; telemetry must never slow down or break the CLI.
 */

const SUPABASE_URL = "https://mlpyahxbuzajgwfmoqah.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a2QHM2m7hYypm6Wg_c1ndQ_SZgu4Jhr";
const ENDPOINT = `${SUPABASE_URL}/rest/v1/cli_telemetry_events`;

export async function sendEvent(row: Record<string, unknown>): Promise<void> {
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Network down, table missing, offline — silently drop. Never throws.
  }
}
