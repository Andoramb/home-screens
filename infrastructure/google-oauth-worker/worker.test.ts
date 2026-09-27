import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { type Env } from './worker';
import { PHOTOS_CLIENT_ID, REDIRECT_URI } from './config';

const SECRET = 'photos-web-secret';
const TOKEN_ENDPOINT = 'https://auth.homescreens.dev/google/photos/token';

interface Upstream { url: string; body: URLSearchParams }

let upstream: Upstream[];

function googleAnswers(status: number, body: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    upstream.push({ url: String(input), body: new URLSearchParams(String(init?.body ?? '')) });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }));
}

function post(form: Record<string, string> | string, headers: Record<string, string> = {}) {
  const body = typeof form === 'string' ? form : new URLSearchParams(form).toString();
  return new Request(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
}

const env = (overrides: Partial<Env> = {}): Env => ({ GOOGLE_PHOTOS_CLIENT_SECRET: SECRET, ...overrides });

beforeEach(() => {
  upstream = [];
  googleAnswers(200, { access_token: 'ya29.new', refresh_token: '1//new', expires_in: 3599 });
});

afterEach(() => vi.unstubAllGlobals());

describe('google sign-in helper', () => {
  it('adds the secret to a sign-in code and forwards only what Google needs', async () => {
    const res = await worker.fetch(post({
      grant_type: 'authorization_code',
      code: '4/0AdLIrY-code',
      // A caller cannot choose the app, the secret, the return page or the scope.
      client_id: 'someone-elses-client',
      client_secret: 'someone-elses-secret',
      redirect_uri: 'https://evil.example/cb',
      scope: 'https://www.googleapis.com/auth/drive',
    }), env());

    expect(res.status).toBe(200);
    expect(upstream).toHaveLength(1);
    expect(upstream[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(Object.fromEntries(upstream[0].body)).toEqual({
      client_id: PHOTOS_CLIENT_ID,
      client_secret: SECRET,
      grant_type: 'authorization_code',
      code: '4/0AdLIrY-code',
      redirect_uri: REDIRECT_URI,
    });
  });

  it('adds the secret to a refresh token', async () => {
    await worker.fetch(post({ grant_type: 'refresh_token', refresh_token: '1//hosted', client_id: PHOTOS_CLIENT_ID }), env());

    expect(Object.fromEntries(upstream[0].body)).toEqual({
      client_id: PHOTOS_CLIENT_ID,
      client_secret: SECRET,
      grant_type: 'refresh_token',
      refresh_token: '1//hosted',
    });
  });

  it("returns Google's answer unchanged, and never lets it be cached", async () => {
    googleAnswers(400, { error: 'invalid_grant', error_description: 'Bad Request' });

    const res = await worker.fetch(post({ grant_type: 'refresh_token', refresh_token: '1//revoked' }), env());

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_grant', error_description: 'Bad Request' });
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each([
    ['client credentials', { grant_type: 'client_credentials' }, 'unsupported_grant_type'],
    ['a password grant', { grant_type: 'password', username: 'u', password: 'p' }, 'unsupported_grant_type'],
    ['a device code', { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: 'x' }, 'unsupported_grant_type'],
    ['no grant type', { code: 'x' }, 'unsupported_grant_type'],
    ['a sign-in without its code', { grant_type: 'authorization_code' }, 'invalid_request'],
    ['a refresh without its token', { grant_type: 'refresh_token' }, 'invalid_request'],
  ])('refuses %s without calling Google', async (_label, form, error) => {
    const res = await worker.fetch(post(form), env());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(error);
    expect(upstream).toHaveLength(0);
  });

  it('answers only POST on its one path', async () => {
    const other = await worker.fetch(new Request('https://auth.homescreens.dev/google/calendar/token', { method: 'POST' }), env());
    const get = await worker.fetch(new Request(TOKEN_ENDPOINT), env());

    expect(other.status).toBe(404);
    expect(get.status).toBe(405);
    expect(get.headers.get('Allow')).toBe('POST');
    expect(upstream).toHaveLength(0);
  });

  it('refuses oversized requests', async () => {
    const res = await worker.fetch(post(`grant_type=refresh_token&refresh_token=${'x'.repeat(9_000)}`), env());

    expect(res.status).toBe(413);
    expect(upstream).toHaveLength(0);
  });

  it('rate-limits by network address', async () => {
    const limit = vi.fn(async () => ({ success: false }));

    const res = await worker.fetch(
      post({ grant_type: 'refresh_token', refresh_token: '1//x' }, { 'CF-Connecting-IP': '203.0.113.7' }),
      env({ TOKEN_LIMITER: { limit } }),
    );

    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(upstream).toHaveLength(0);
  });

  it('says it is not set up rather than calling Google without a secret', async () => {
    const res = await worker.fetch(post({ grant_type: 'refresh_token', refresh_token: '1//x' }), env({ GOOGLE_PHOTOS_CLIENT_SECRET: undefined }));

    expect(res.status).toBe(503);
    expect(upstream).toHaveLength(0);
  });

  it('reports an unreachable Google in the shape hubs already understand', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));

    const res = await worker.fetch(post({ grant_type: 'refresh_token', refresh_token: '1//x' }), env());

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: 'temporarily_unavailable',
      error_description: "Couldn't reach Google. Try again in a few minutes.",
    });
  });
});
