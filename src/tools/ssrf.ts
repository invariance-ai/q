import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard. Blocks requests to private / internal / loopback / link-local
 * targets so a user- or LLM-supplied URL can't reach cloud metadata, internal
 * services, or the local host. DNS names are resolved and ALL resolved
 * addresses are checked (a partial mitigation for DNS-rebinding).
 */

/** Resolver injection point for tests (defaults to dns/promises lookup). */
export type LookupFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = (hostname) =>
  lookup(hostname, { all: true });

/** Parse an IPv4 dotted-quad into its four octets, or undefined if not IPv4. */
function ipv4Octets(ip: string): [number, number, number, number] | undefined {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if (a > 255 || b > 255 || c > 255 || d > 255) return undefined;
  return [a, b, c, d];
}

/** Normalize an IPv6 string for prefix checks (lowercased, no zone id). */
function normalizeIpv6(ip: string): string {
  return ip.toLowerCase().split("%")[0] ?? "";
}

/**
 * True if `ip` is a literal address in a range we refuse to fetch by default:
 *   - loopback        127.0.0.0/8, ::1
 *   - link-local v4   169.254.0.0/16 (incl. 169.254.169.254 cloud metadata)
 *   - link-local v6   fe80::/10
 *   - private v4      10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *   - unique-local v6 fc00::/7 (fc00::/8 + fd00::/8)
 *   - unspecified     0.0.0.0, ::
 * Also handles IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1).
 */
export function isBlockedAddress(ip: string): boolean {
  const v4 = ipv4Octets(ip);
  if (v4) return isBlockedV4(v4);

  if (isIP(ip) === 6) {
    const norm = normalizeIpv6(ip);

    // Unspecified / loopback.
    if (norm === "::" || norm === "::1") return true;

    // IPv4-mapped (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) — re-check as IPv4.
    const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(norm);
    if (mapped && mapped[1]) {
      const mv4 = ipv4Octets(mapped[1]);
      if (mv4) return isBlockedV4(mv4);
    }

    // Link-local fe80::/10 -> first 16 bits fe80..febf.
    if (/^fe[89ab][0-9a-f]?:/.test(norm)) return true;

    // Unique-local fc00::/7 -> fc00..fdff (first byte 0xfc or 0xfd).
    if (/^f[cd][0-9a-f]{0,2}:/.test(norm)) return true;

    return false;
  }

  return false;
}

function isBlockedV4([a, b, c]: [number, number, number, number]): boolean {
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 169 && b === 254) return true; // link-local (incl. metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 0 && b === 0 && c === 0) return true; // 0.0.0.0/8 unspecified
  return false;
}

export interface GuardResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Inspect a fully-interpolated URL and decide whether it is safe to fetch.
 * If the host is a literal IP it is range-checked directly; if it is a DNS
 * name it is resolved and blocked when ANY resolved address is internal.
 * Returns `{ blocked: false }` when the request may proceed.
 */
export async function guardUrl(
  url: string,
  opts?: { lookupFn?: LookupFn },
): Promise<GuardResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { blocked: true, reason: `invalid URL: ${url}` };
  }

  const proto = parsed.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") {
    return { blocked: true, reason: `unsupported scheme: ${parsed.protocol}` };
  }

  // URL hostname strips IPv6 brackets already.
  const host = parsed.hostname;
  if (host.length === 0) {
    return { blocked: true, reason: "missing host" };
  }

  // Literal IP host: check directly.
  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) {
      return { blocked: true, reason: `private/internal address ${host}` };
    }
    return { blocked: false };
  }

  // DNS name: resolve and block if any address is internal.
  const lookupFn = opts?.lookupFn ?? defaultLookup;
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookupFn(host);
  } catch (err) {
    return { blocked: true, reason: `DNS resolution failed for ${host}: ${(err as Error).message}` };
  }
  if (addrs.length === 0) {
    return { blocked: true, reason: `no addresses for ${host}` };
  }
  for (const { address } of addrs) {
    if (isBlockedAddress(address)) {
      return {
        blocked: true,
        reason: `${host} resolves to private/internal address ${address}`,
      };
    }
  }
  return { blocked: false };
}
