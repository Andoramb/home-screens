/**
 * Shared SSRF prevention utilities.
 *
 * Any server-side code that fetches a user-supplied URL should call
 * `isSafeExternalUrl()` (or at minimum `isBlockedHost()`) before making
 * the request.
 *
 * Two layers of defense:
 *  1. Fast-path string check (`isBlockedHost`) — rejects obvious literal
 *     private/loopback addresses (IPv4 and IPv6) without a DNS round-trip.
 *  2. DNS-resolved check (`isSafeExternalUrl`) — resolves the hostname and
 *     validates EVERY resulting IP against the same blocklist. Closes the
 *     DNS-rebinding gap where `evil.com` resolves to `127.0.0.1`.
 *
 * IMPORTANT: results are NOT cached. A previous version of this file kept
 * a 60-second resolved-IP cache for performance. That cache re-introduced
 * the rebinding window it was meant to defend against — an attacker could
 * present a public IP on the first lookup, get cached, then rebind to a
 * private IP for the next 60 seconds while subsequent fetches did their
 * own (now-stale) DNS lookup. We always re-resolve so the safety check and
 * the actual fetch see the same addresses.
 */

import { promises as dns } from 'dns';
import { fetchWithTimeout } from '@/lib/api-utils';

// --- Domain validation ---

function matchesDomain(hostname: string, pattern: string): boolean {
  if (pattern === '*') return true; // caller already checked isBlockedHost
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith('.' + suffix);
  }
  return hostname === pattern;
}

export function isAllowedDomain(url: string, allowedDomains: string[], allowLan: boolean): boolean {
  try {
    const { hostname } = new URL(url);
    // Without allowLan, apply the strict SSRF blocklist (rejects all private
    // ranges and loopback). With allowLan, reject only the targets that are
    // dangerous regardless of permission: cloud metadata + unspecified.
    if (!allowLan && isBlockedHost(hostname)) return false;
    if (allowLan) {
      const lit = hostname.toLowerCase();
      if (lit === '0.0.0.0' || lit === '169.254.169.254') return false;
    }
    return allowedDomains.some((pattern) => matchesDomain(hostname, pattern));
  } catch {
    return false;
  }
}

// ── IPv6 range checks ────────────────────────────────────────────────────
//
// We can't blanket-block bracketed IPv6 because legitimate dual-stack APIs
// and CDNs return AAAA records. Match the actual private/internal ranges
// instead, parallel to the IPv4 check below.
function isBlockedIPv6(addr: string): boolean {
  // Normalize: lowercase, strip brackets, strip zone id (e.g. fe80::1%eth0)
  let v = addr.toLowerCase();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  const zoneIdx = v.indexOf('%');
  if (zoneIdx >= 0) v = v.slice(0, zoneIdx);

  if (v === '') return true;
  // Loopback ::1 (and unspecified ::)
  if (v === '::1' || v === '0:0:0:0:0:0:0:1') return true;
  if (v === '::' || v === '0:0:0:0:0:0:0:0') return true;
  // Link-local fe80::/10 — first 10 bits are 1111 1110 10
  // First two hex digits in [fe80, febf]; lookahead handles short forms.
  if (/^fe[89ab](?:[0-9a-f])?:/.test(v)) return true;
  // Unique local fc00::/7 — first 7 bits are 1111 110
  // First two hex digits in [fc00, fdff].
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return true;
  // IPv4-mapped IPv6 ::ffff:a.b.c.d — validate the embedded IPv4
  const v4Mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Mapped) return isBlockedHost(v4Mapped[1]);
  // Deprecated IPv4-compatible ::a.b.c.d
  const v4Compat = v.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Compat) return isBlockedHost(v4Compat[1]);

  return false;
}

/**
 * Returns true when a hostname is a literal private, loopback, link-local,
 * or cloud-metadata address that should never be reached via user-supplied
 * URLs. Handles IPv4 dotted-decimal, bracketed IPv6, and bare IPv6 (which
 * is what `dns.lookup` returns for AAAA records).
 *
 * For DNS names, this returns false on its own — use `isSafeExternalUrl`
 * to validate after resolution.
 */
export function isBlockedHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '0.0.0.0') return true;
  // Bracketed literal IPv6 (e.g. [::1], [2001:db8::1])
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return isBlockedIPv6(hostname);
  }
  // Bare IPv6 (e.g. ::1, 2001:db8::1) — what dns.lookup returns for AAAA
  if (hostname.includes(':')) {
    return isBlockedIPv6(hostname);
  }
  // IPv4 ranges
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    if (parts[0] === 10) return true;                                  // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true;            // 192.168.0.0/16
    if (parts[0] === 127) return true;                                 // 127.0.0.0/8
    if (parts[0] === 169 && parts[1] === 254) return true;            // 169.254.0.0/16 link-local
  }
  return false;
}

/**
 * Reject URLs that point at private/internal networks (SSRF prevention).
 *
 * Only allows http: and https: protocols. Two-stage validation:
 *   1. Fast-path: literal host blocked by `isBlockedHost` → reject without DNS.
 *   2. DNS-resolved: every resolved address must pass `isBlockedHost`. This
 *      catches DNS rebinding (e.g. `evil.com` → 127.0.0.1) and IPv6 internal
 *      addresses returned via AAAA records.
 *
 * Returns false on any error (DNS failure, parse error, blocked address).
 */
export async function isSafeExternalUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  // Fast-path: reject obvious literal private hosts before DNS lookup
  if (isBlockedHost(parsed.hostname)) return false;

  // Strip IPv6 brackets if present (e.g. [2001:db8::1] → 2001:db8::1)
  const hostForLookup = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;

  // Always re-resolve. dns.lookup uses the system resolver (matches what
  // fetch() does under the hood) so the safety check and the subsequent
  // fetch see the same addresses. Caching here would re-introduce the
  // DNS-rebinding window we're trying to close.
  let addresses: string[];
  try {
    const results = await dns.lookup(hostForLookup, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    // Resolution failure → treat as unsafe
    return false;
  }
  if (addresses.length === 0) return false;

  // Every resolved address must pass the blocklist. isBlockedHost handles
  // both bare IPv4 and bare IPv6 forms returned by dns.lookup directly.
  for (const addr of addresses) {
    if (isBlockedHost(addr)) return false;
  }
  return true;
}

// ── Relaxed variant: LAN-allowed (localNetwork permission) ───────────────
//
// The strict blocklist above is right for plugins that talk to public SaaS
// APIs. Self-hosted LAN services (Home Assistant, Plex, Proxmox, Octoprint)
// live on RFC1918 addresses, so those plugins would never succeed. A plugin
// that declares the `localNetwork` permission opts into this relaxed path:
//
//   Still blocked:
//     - AWS/GCP/Azure cloud metadata endpoints (169.254.169.254, fd00:ec2::254)
//     - Unspecified addresses (0.0.0.0, ::) — routable to anything
//     - Invalid / empty hosts
//
//   Now allowed (user consented via `localNetwork` permission):
//     - Loopback (127/8, ::1) — single-box installs (HA + HS on same host)
//     - RFC1918 private (10/8, 172.16/12, 192.168/16)
//     - Link-local / APIPA (169.254/16, except the metadata IP)
//     - IPv6 ULA (fc00::/7) and link-local (fe80::/10)
//
// DNS-rebinding defense still applies: every resolved address is re-checked.
function isBlockedHostForLan(hostname: string): boolean {
  if (hostname === '' || hostname === '0.0.0.0') return true;
  // Bracketed or bare IPv6
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return isBlockedIPv6ForLan(hostname);
  }
  if (hostname.includes(':')) {
    return isBlockedIPv6ForLan(hostname);
  }
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    // Cloud metadata — always blocked regardless of permission
    if (parts[0] === 169 && parts[1] === 254 && parts[2] === 169 && parts[3] === 254) return true;
  }
  return false;
}

function isBlockedIPv6ForLan(addr: string): boolean {
  let v = addr.toLowerCase();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  const zoneIdx = v.indexOf('%');
  if (zoneIdx >= 0) v = v.slice(0, zoneIdx);

  if (v === '') return true;
  if (v === '::' || v === '0:0:0:0:0:0:0:0') return true;    // unspecified
  // AWS IPv6 metadata
  if (v === 'fd00:ec2::254' || v === 'fd00:ec2:0:0:0:0:0:254') return true;
  // IPv4-mapped: check embedded IPv4 under the same LAN rules
  const v4Mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Mapped) return isBlockedHostForLan(v4Mapped[1]);
  const v4Compat = v.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Compat) return isBlockedHostForLan(v4Compat[1]);
  return false;
}

/**
 * Relaxed variant of `isSafeExternalUrl` — allows RFC1918 / mDNS / link-local
 * addresses, still blocks loopback and cloud-metadata endpoints.
 *
 * ONLY the plugin proxy should call this, and ONLY for plugins that declare
 * the `localNetwork` permission in their manifest. Every other caller of
 * user-supplied URLs should continue using `isSafeExternalUrl`.
 */
export async function isSafeLocalOrExternalUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  if (isBlockedHostForLan(parsed.hostname)) return false;

  const hostForLookup = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;

  let addresses: string[];
  try {
    const results = await dns.lookup(hostForLookup, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;

  for (const addr of addresses) {
    if (isBlockedHostForLan(addr)) return false;
  }
  return true;
}

// ── Fetching a user-supplied URL safely ──────────────────────────────────
//
// Following redirects is where an SSRF check quietly stops working: an
// allowed public host answers 302 and points at http://169.254.169.254/ or
// http://192.168.1.1/, and fetch's automatic following takes us there with
// no second check. So every hop is followed by hand and re-checked with the
// same rules as the first URL, and the body is read against a byte cap so a
// link to something enormous cannot exhaust memory.
//
// This reads a URL with GET. The plugin proxy carries a method and a body
// and streams the response straight back to its caller, so it keeps its own
// loop; everything that downloads a document can use this.

/** Why a fetch could not be completed. Callers map these to their own wording. */
export type FetchRedirectFailure =
  /** The link, or a Location header, is not a usable web address. */
  | 'invalid-url'
  /** The host is outside `allowHosts`. */
  | 'not-allowed'
  /** The host resolves to a private, loopback or cloud-metadata address. */
  | 'blocked'
  /** More redirects than `maxHops`. */
  | 'too-many-redirects'
  /** The response body is over `maxBytes`. */
  | 'too-large'
  /** No answer within `timeoutMs`. */
  | 'timeout'
  /** The connection failed. */
  | 'unreachable';

export interface FetchWithAllowedRedirectsOptions {
  /**
   * Hosts the request may reach, as exact hostnames, `*.example.com` for a
   * domain and its subdomains, or `*` for any host that is not blocked.
   */
  allowHosts: string[];
  /** Redirects to follow before giving up. Default 5. */
  maxHops?: number;
  /** Cap on the response body, enforced while reading. Default 1 MB. */
  maxBytes?: number;
  /** Per-request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Retries per request on a timeout or a 5xx. Default 0. */
  retries?: number;
  /** Extra request headers, such as a user agent or an accept header. */
  headers?: Record<string, string>;
  /**
   * Allow private addresses, for a household that runs the service being
   * fetched on its own network. Loopback and cloud metadata stay blocked.
   */
  allowPrivateNetwork?: boolean;
}

export type FetchWithAllowedRedirectsResult =
  | {
      /**
       * The request finished safely and the whole body fits the cap. This
       * says nothing about the HTTP result: check `status`, since an error
       * page is often the most useful thing to show a person.
       */
      ok: true;
      /** The URL that answered, after any redirects. */
      url: string;
      status: number;
      /** Lowercased content type, parameters included, or '' when absent. */
      contentType: string;
      /**
       * The answering response's headers. Some downloads carry the only copy
       * of a useful name in `content-disposition`, so callers need to read
       * headers other than the content type.
       */
      responseHeaders: Headers;
      body: Uint8Array;
    }
  | {
      ok: false;
      reason: FetchRedirectFailure;
      /** The URL the failure happened at, which may be a redirect target. */
      url: string;
      status?: number;
      contentType?: string;
    };

function fetchFailure(error: unknown): 'timeout' | 'unreachable' {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unreachable';
}

const DEFAULT_MAX_HOPS = 5;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/**
 * Read a response body in chunks, stopping as soon as the running total goes
 * over `maxBytes`. Returns null when it does, so nothing oversized is ever
 * held in memory in full.
 */
async function readBoundedBody(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  // Fast path: trust a sane Content-Length before consuming anything.
  const declaredLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;

  const reader = res.body?.getReader();
  // No streaming body. Real responses always have one; this is for synthetic
  // responses that turn up in tests.
  if (!reader) {
    const buffered = new Uint8Array(await res.arrayBuffer());
    return buffered.byteLength > maxBytes ? null : buffered;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      // Cancel so the socket is released instead of being drained.
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * GET a URL, following redirects by hand and re-checking every hop against
 * `allowHosts` and the SSRF blocklist before going there.
 *
 * Never throws: a timeout, a refused hop or an oversized body all come back
 * as `{ ok: false, reason }` with the URL that caused it, which is enough to
 * tell a person in plain words what went wrong.
 */
export async function fetchWithAllowedRedirects(
  url: string,
  options: FetchWithAllowedRedirectsOptions,
): Promise<FetchWithAllowedRedirectsResult> {
  const {
    allowHosts,
    maxHops = DEFAULT_MAX_HOPS,
    maxBytes = DEFAULT_MAX_BODY_BYTES,
    timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    retries = 0,
    headers,
    allowPrivateNetwork = false,
  } = options;

  const isSafe = (candidate: string) =>
    allowPrivateNetwork ? isSafeLocalOrExternalUrl(candidate) : isSafeExternalUrl(candidate);

  let current: string;
  try {
    current = new URL(url).toString();
  } catch {
    return { ok: false, reason: 'invalid-url', url };
  }
  if (!isAllowedDomain(current, allowHosts, allowPrivateNetwork)) {
    return { ok: false, reason: 'not-allowed', url: current };
  }
  if (!(await isSafe(current))) {
    return { ok: false, reason: 'blocked', url: current };
  }

  let res!: Response;
  for (let hop = 0; ; hop++) {
    try {
      res = await fetchWithTimeout(current, {
        timeout: timeoutMs,
        retries,
        redirect: 'manual',
        headers,
      });
    } catch (err) {
      return { ok: false, reason: fetchFailure(err), url: current };
    }

    // A 3xx without a Location header has nowhere to go, so it is the answer.
    if (res.status < 300 || res.status >= 400) break;
    const location = res.headers.get('location');
    if (!location) break;

    if (hop === maxHops) {
      return { ok: false, reason: 'too-many-redirects', url: current };
    }

    let next: string;
    try {
      next = new URL(location, current).toString();
    } catch {
      return { ok: false, reason: 'invalid-url', url: current };
    }
    // The whole point of following by hand: the same two checks the first URL
    // had to pass, before anything is fetched from the new host.
    if (!isAllowedDomain(next, allowHosts, allowPrivateNetwork)) {
      return { ok: false, reason: 'not-allowed', url: next };
    }
    if (!(await isSafe(next))) {
      return { ok: false, reason: 'blocked', url: next };
    }
    current = next;
  }

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  let body: Uint8Array | null;
  try {
    body = await readBoundedBody(res, maxBytes);
  } catch (error) {
    return { ok: false, reason: fetchFailure(error), url: current, status: res.status, contentType };
  }
  if (!body) {
    return { ok: false, reason: 'too-large', url: current, status: res.status, contentType };
  }
  return { ok: true, url: current, status: res.status, contentType, responseHeaders: res.headers, body };
}
