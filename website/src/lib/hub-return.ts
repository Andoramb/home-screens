/**
 * Where /connect/google may send a Google Photos sign-in: straight back to
 * the Home Screens hub that started it, but only when that hub is on a home
 * network.
 *
 * A hub with Home Screens' own Google app switched on puts its address in
 * the sign-in link's `state`: `<one-time value>.<base64url(address)>` (the
 * app's src/lib/google-picker-sign-in.ts writes it). Anyone can make a
 * sign-in link with any `state`, so forwarding to any address would let a
 * stranger's link collect a family's code. A home-network address only
 * reaches a device inside the home the browser is in, which is what makes
 * the forward safe. Everything else, including a hub on a public web
 * address, gets the copy-a-code page, and so does every link without an
 * address (older hubs, and every hub with the switch off).
 */

/** The page on the hub that finishes the sign-in. */
export const HUB_RETURN_PATH = '/editor/connect/google'

/** Home-network name endings, plus the name every computer calls itself. */
const HOME_NAME = /\.(local|home\.arpa|internal|lan)$/

/** IPv4 home, link-local, loopback and carrier-grade NAT ranges, as [first octets, prefix length]. */
const HOME_V4: Array<[number[], number]> = [
  [[10], 8],
  [[172, 16], 12],
  [[192, 168], 16],
  [[127], 8],
  [[169, 254], 16],
  [[100, 64], 10],
]

function ipv4(host: string): number[] | null {
  const parts = host.split('.')
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null
  const octets = parts.map(Number)
  return octets.every((o) => o <= 255) ? octets : null
}

function inRange(octets: number[], [start, bits]: [number[], number]): boolean {
  const value = octets.reduce((acc, o) => acc * 256 + o, 0)
  const base = [...start, 0, 0, 0, 0].slice(0, 4).reduce((acc, o) => acc * 256 + o, 0)
  const size = 2 ** (32 - bits)
  return Math.floor(value / size) === Math.floor(base / size)
}

/** `::1`, `fc00::/7` (unique local) and `fe80::/10` (link-local). */
function isHomeIpv6(bracketed: string): boolean {
  const address = bracketed.slice(1, -1)
  if (address === '::1') return true
  const first = address.startsWith('::') ? 0 : parseInt(address.split(':')[0], 16)
  if (Number.isNaN(first)) return false
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
}

/** True for a host that can only be reached from inside a home network. */
export function isHomeNetworkHost(hostname: string): boolean {
  if (hostname.startsWith('[')) return isHomeIpv6(hostname)
  const octets = ipv4(hostname)
  if (octets) return HOME_V4.some((range) => inRange(octets, range))
  // A written-out root dot ("hub.local.") names the same host.
  const name = hostname.replace(/\.$/, '')
  return name === 'localhost' || HOME_NAME.test(name)
}

function decodeBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0)),
    )
  } catch {
    return null
  }
}

/**
 * The hub origin a sign-in may be forwarded to, from the link's `state`, or
 * null when the page should show the code to copy instead.
 */
export function hubReturnOrigin(state: string | null): string | null {
  if (!state || state.length > 1024) return null
  const parts = state.split('.')
  if (parts.length !== 2 || !parts[0]) return null
  const address = decodeBase64Url(parts[1])
  if (!address) return null

  let url: URL
  try {
    url = new URL(address)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // An origin and nothing else: no user name, path, query or fragment.
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
  if (!isHomeNetworkHost(url.hostname)) return null
  return url.origin
}
