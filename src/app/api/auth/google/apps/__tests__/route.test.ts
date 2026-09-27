import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Driven through the real token stores over an in-memory secrets file, so the
// answer is the same resolution sign-in itself uses.

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const secrets = new Map<string, string>();
vi.mock('@/lib/secrets', () => ({
  getSecret: vi.fn(async (key: string) => secrets.get(key) ?? null),
}));

const { GET } = await import('@/app/api/auth/google/apps/route');

async function apps() {
  const res = await GET(new NextRequest('http://localhost/api/auth/google/apps'));
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(() => {
  secrets.clear();
  vi.stubEnv('HS_GOOGLE_HOSTED', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/auth/google/apps', () => {
  it('reports no Home Screens app while the switch is off', async () => {
    expect(await apps()).toEqual({
      calendar: { mode: null, hostedAvailable: false },
      photos: { mode: null, hostedAvailable: false },
    });
  });

  it('reports the household\'s own app with the switch off, as before', async () => {
    secrets.set('google_client_id', 'own-tv-id');
    secrets.set('google_client_secret', 'own-tv-secret');
    expect(await apps()).toEqual({
      calendar: { mode: 'own', hostedAvailable: false },
      photos: { mode: null, hostedAvailable: false },
    });
  });

  it('reports Home Screens\' app for both when the switch is on and nothing is saved', async () => {
    vi.stubEnv('HS_GOOGLE_HOSTED', '1');
    expect(await apps()).toEqual({
      calendar: { mode: 'hosted', hostedAvailable: true },
      photos: { mode: 'hosted', hostedAvailable: true },
    });
  });

  it('keeps each integration on the household\'s own app, even half saved', async () => {
    vi.stubEnv('HS_GOOGLE_HOSTED', '1');
    secrets.set('google_web_client_id', 'own-web-id');
    expect(await apps()).toEqual({
      calendar: { mode: 'hosted', hostedAvailable: true },
      // Half an own app is still the household's app, and it can't sign in yet.
      photos: { mode: null, hostedAvailable: true },
    });
  });
});
