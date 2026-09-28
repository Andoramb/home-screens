import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { type Env } from './worker';
import { CALENDAR_CLIENT_ID, DEVICE_CODE_GRANT, PHOTOS_CLIENT_ID, REDIRECT_URI } from './config';

const SECRET = 'photos-web-secret';
const CALENDAR_SECRET = 'calendar-tv-secret';
const TOKEN_ENDPOINT = 'https://auth.homescreens.dev/google/photos/token';
const CALENDAR_ENDPOINT = 'https://auth.homescreens.dev/google/calendar/token';

interface Upstream { url: string; body: URLSearchParams }

let upstream: Upstream[];

function googleAnswers(status: number, body: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    upstream.push({ url: String(input), body: new URLSearchParams(String(init?.body ?? '')) });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }));
}

function post(form: Record<string, string> | string, headers: Record<string, string> = {}, endpoint = TOKEN_ENDPOINT) {
  const body = typeof form === 'string' ? form : new URLSearchParams(form).toString();
  return new Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
}

const env = (overrides: Partial<Env> = {}): Env => ({
  GOOGLE_PHOTOS_CLIENT_SECRET: SECRET,
  GOOGLE_CALENDAR_CLIENT_SECRET: CALENDAR_SECRET,
  ...overrides,
});

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

  it("passes a sign-in's PKCE verifier on to Google", async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    const res = await worker.fetch(post({ grant_type: 'authorization_code', code: '4/0AdLIrY-code', code_verifier: verifier }), env());

    expect(res.status).toBe(200);
    expect(Object.fromEntries(upstream[0].body)).toEqual({
      client_id: PHOTOS_CLIENT_ID,
      client_secret: SECRET,
      grant_type: 'authorization_code',
      code: '4/0AdLIrY-code',
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
  });

  it.each([
    ['too short', 'x'.repeat(42)],
    ['too long', 'x'.repeat(129)],
    ['not URL-safe', `${'x'.repeat(42)}+`],
    ['empty', ''],
  ])('refuses a PKCE verifier that is %s without calling Google', async (_label, verifier) => {
    const res = await worker.fetch(post({ grant_type: 'authorization_code', code: 'x', code_verifier: verifier }), env());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_request');
    expect(upstream).toHaveLength(0);
  });

  it('passes a PKCE verifier only with a sign-in code', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    await worker.fetch(post({ grant_type: 'refresh_token', refresh_token: '1//hosted', code_verifier: verifier }), env());
    await worker.fetch(post({ grant_type: DEVICE_CODE_GRANT, device_code: 'AH-1', code_verifier: verifier }, {}, CALENDAR_ENDPOINT), env());
    await worker.fetch(post({ grant_type: 'refresh_token', refresh_token: '1//cal', code_verifier: verifier }, {}, CALENDAR_ENDPOINT), env());

    expect(upstream).toHaveLength(3);
    for (const call of upstream) expect(call.body.has('code_verifier')).toBe(false);
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

  it('answers only POST on its own paths', async () => {
    const other = await worker.fetch(new Request('https://auth.homescreens.dev/google/drive/token', { method: 'POST' }), env());
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

describe('google sign-in helper: Calendar', () => {
  const postCalendar = (form: Record<string, string>) => post(form, {}, CALENDAR_ENDPOINT);

  it('adds the Calendar secret when a hub collects a finished short-code sign-in', async () => {
    const res = await worker.fetch(postCalendar({
      grant_type: DEVICE_CODE_GRANT,
      device_code: 'AH-1Ng2x',
      client_id: 'someone-elses-client',
      client_secret: 'someone-elses-secret',
      scope: 'https://www.googleapis.com/auth/drive',
    }), env());

    expect(res.status).toBe(200);
    expect(upstream[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(Object.fromEntries(upstream[0].body)).toEqual({
      client_id: CALENDAR_CLIENT_ID,
      client_secret: CALENDAR_SECRET,
      grant_type: DEVICE_CODE_GRANT,
      device_code: 'AH-1Ng2x',
    });
  });

  it('adds the Calendar secret to a Calendar renewal', async () => {
    await worker.fetch(postCalendar({ grant_type: 'refresh_token', refresh_token: '1//calendar' }), env());

    expect(Object.fromEntries(upstream[0].body)).toEqual({
      client_id: CALENDAR_CLIENT_ID,
      client_secret: CALENDAR_SECRET,
      grant_type: 'refresh_token',
      refresh_token: '1//calendar',
    });
  });

  it("passes Google's \"still waiting\" answer back so the hub keeps polling", async () => {
    googleAnswers(428, { error: 'authorization_pending', error_description: 'Precondition Required' });

    const res = await worker.fetch(postCalendar({ grant_type: DEVICE_CODE_GRANT, device_code: 'AH-1Ng2x' }), env());

    expect(res.status).toBe(428);
    expect((await res.json()).error).toBe('authorization_pending');
  });

  it.each([
    ['a sign-in code (that is the Photos app\'s step)', { grant_type: 'authorization_code', code: 'x' }, 'unsupported_grant_type'],
    ['client credentials', { grant_type: 'client_credentials' }, 'unsupported_grant_type'],
    ['a device poll without its code', { grant_type: DEVICE_CODE_GRANT }, 'invalid_request'],
  ])('refuses %s without calling Google', async (_label, form, error) => {
    const res = await worker.fetch(postCalendar(form), env());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(error);
    expect(upstream).toHaveLength(0);
  });

  it('keeps each app to its own secret: Calendar is not set up while Photos is', async () => {
    const calendar = await worker.fetch(
      postCalendar({ grant_type: 'refresh_token', refresh_token: '1//x' }),
      env({ GOOGLE_CALENDAR_CLIENT_SECRET: undefined }),
    );
    const photos = await worker.fetch(
      post({ grant_type: 'refresh_token', refresh_token: '1//x' }),
      env({ GOOGLE_CALENDAR_CLIENT_SECRET: undefined }),
    );

    expect(calendar.status).toBe(503);
    expect(photos.status).toBe(200);
    expect(upstream).toHaveLength(1);
    expect(upstream[0].body.get('client_id')).toBe(PHOTOS_CLIENT_ID);
  });
});
