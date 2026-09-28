import { describe, it, expect } from 'vitest'
import { hubReturnOrigin } from '../hub-return'

/** A sign-in link's `state` as a hub writes it: `<one-time value>.<base64url(address)>`. */
const stateFor = (address: string) =>
  `${'n'.repeat(43)}.${Buffer.from(address).toString('base64url')}`

describe('hubReturnOrigin', () => {
  it.each([
    ['a home IP and port', 'http://192.168.1.50:3000', 'http://192.168.1.50:3000'],
    ['10/8', 'http://10.0.0.7', 'http://10.0.0.7'],
    ['the top of 172.16/12', 'http://172.31.255.255:3000', 'http://172.31.255.255:3000'],
    ['loopback', 'http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
    ['link-local', 'http://169.254.10.20', 'http://169.254.10.20'],
    ['carrier-grade NAT (Tailscale)', 'http://100.101.102.103:3000', 'http://100.101.102.103:3000'],
    ['https', 'https://192.168.1.50', 'https://192.168.1.50'],
    ['a .local name', 'http://homescreens.local:3000', 'http://homescreens.local:3000'],
    ['a .home.arpa name', 'http://hub.home.arpa', 'http://hub.home.arpa'],
    ['a .internal name', 'https://hub.internal', 'https://hub.internal'],
    ['a .lan name', 'http://hub.lan:3000', 'http://hub.lan:3000'],
    ['localhost', 'http://localhost:3000', 'http://localhost:3000'],
    ['upper case', 'HTTP://HOMESCREENS.LOCAL:3000', 'http://homescreens.local:3000'],
    ['a trailing root dot', 'http://homescreens.local.:3000', 'http://homescreens.local.:3000'],
    ['a trailing dot on an IP', 'http://192.168.1.50.', 'http://192.168.1.50'],
    ['an IP written as one number', 'http://3232235826:3000', 'http://192.168.1.50:3000'],
    ['IPv6 loopback', 'http://[::1]:3000', 'http://[::1]:3000'],
    ['IPv6 unique local', 'http://[fd12:3456::1]:3000', 'http://[fd12:3456::1]:3000'],
    ['IPv6 link-local', 'http://[fe80::1]', 'http://[fe80::1]'],
    ['a trailing slash', 'http://192.168.1.50:3000/', 'http://192.168.1.50:3000'],
  ])('forwards to %s', (_label, address, expected) => {
    expect(hubReturnOrigin(stateFor(address))).toBe(expected)
  })

  it.each([
    ['a public name', 'https://photos.example.com'],
    ['a public IP', 'http://8.8.8.8'],
    ['a home IP followed by a public name', 'http://192.168.1.50.evil.com'],
    ['a home name followed by a public one', 'http://hub.local.evil.com'],
    ['a user name hiding a public host', 'http://192.168.1.50@evil.com'],
    ['a public user name before a home host', 'http://evil.com@192.168.1.50'],
    ['a backslash trick', 'http://192.168.1.50\\@evil.com'],
    ['an IPv4-mapped IPv6 address', 'http://[::ffff:192.168.1.50]'],
    ['a public IPv6 address', 'http://[2001:db8::1]'],
    ['the old site-local IPv6 range', 'http://[fec0::1]'],
    ['just past 172.16/12', 'http://172.32.0.1'],
    ['just before 100.64/10', 'http://100.63.255.255'],
    ['a bare name ending', 'http://local'],
    ['a name that only contains a home ending', 'http://lan.example.com'],
    ['a path', 'http://192.168.1.50:3000/evil'],
    ['a query', 'http://192.168.1.50:3000/?x=1'],
    ['a fragment', 'http://192.168.1.50:3000/#x'],
    ['another scheme', 'ftp://192.168.1.50'],
    ['script', 'javascript:alert(1)'],
    ['not a URL', '192.168.1.50:3000'],
  ])('shows the code instead for %s', (_label, address) => {
    expect(hubReturnOrigin(stateFor(address))).toBeNull()
  })

  it.each([
    ['no state', null],
    ['an empty state', ''],
    ['a one-time value alone (a hub that could not confirm its address)', 'n'.repeat(43)],
    ['no one-time value', `.${Buffer.from('http://192.168.1.50').toString('base64url')}`],
    ['too many parts', `a.${Buffer.from('http://192.168.1.50').toString('base64url')}.b`],
    ['an address that is not base64url', 'nonce.aHR0cDovLzE5Mi4xNjguMS41MA=='],
    ['an address that is not text', `nonce.${Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url')}`],
    ['a huge state', `nonce.${'A'.repeat(2000)}`],
  ])('shows the code instead for %s', (_label, state) => {
    expect(hubReturnOrigin(state)).toBeNull()
  })
})
