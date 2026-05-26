import { isEnabled, getTelemetry } from "./state.js";
import { sendEvent } from "./client.js";

/**
 * Anonymous event capture. No-ops unless telemetry is enabled. Only coarse,
 * non-identifying fields are ever sent — never question/answer text, tool URLs,
 * responses, or secrets.
 */

const Q_VERSION = "0.1.0";

export interface CaptureProps {
  command?: string;
  routedVia?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  ok?: boolean;
  errorKind?: string;
}

let pending: CaptureProps = {};

/** Stash context (e.g. routedVia/provider/model from an ask) for the next capture. */
export function addContext(p: CaptureProps): void {
  pending = { ...pending, ...p };
}

export function capture(event: string, p: CaptureProps = {}): void {
  if (!isEnabled()) return;
  const t = getTelemetry();
  void sendEvent({
    anon_id: t.anonId ?? "anon",
    event,
    q_version: Q_VERSION,
    props: {
      ...pending,
      ...p,
      os: process.platform,
      node: process.versions.node,
    },
  });
}
