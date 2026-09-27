/**
 * Home Screens Google sign-in helper
 *
 * Holds the client secret of Home Screens' own Google Photos app. It is a
 * "Web application" client (the Photos Picker scope is refused by Google's
 * device flow), and Google's policy is that a web client's secret stays on a
 * server, never inside software people install. Hubs send their token
 * requests here and this Worker adds the secret on the way to Google.
 *
 * Hubs keep their own tokens. This Worker stores nothing and logs no request
 * or response bodies (they carry sign-in codes and refresh tokens).
 *
 * One endpoint, POST /google/photos/token, form-encoded, accepting only:
 *   grant_type=authorization_code with code        (signing in)
 *   grant_type=refresh_token with refresh_token    (renewing a sign-in)
 * Google's answer comes back unchanged. Errors this Worker raises itself use
 * Google's own shape ({ error, error_description }) so hubs show them the
 * same way.
 *
 * Deploy:
 *   npx wrangler secret put GOOGLE_PHOTOS_CLIENT_SECRET
 *   npx wrangler deploy
 */

import { PHOTOS_CLIENT_ID, REDIRECT_URI } from './config';

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  GOOGLE_PHOTOS_CLIENT_SECRET?: string;
  TOKEN_LIMITER?: RateLimiter;
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_PATH = '/google/photos/token';
/** A code or refresh token is a few hundred bytes; nothing legitimate comes close. */
const MAX_BODY_BYTES = 8_192;

function errorResponse(status: number, error: string, description: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

type GrantResult =
  | { ok: true; grant: Record<string, string> }
  | { ok: false; error: string; description: string };

/** Only the fields Google needs, rebuilt from scratch: nothing else a caller sends is passed on. */
function toGoogleGrant(form: URLSearchParams): GrantResult {
  const grantType = form.get('grant_type');
  if (grantType === 'authorization_code') {
    const code = form.get('code');
    if (!code) return { ok: false, error: 'invalid_request', description: 'Missing sign-in code.' };
    return { ok: true, grant: { grant_type: grantType, code, redirect_uri: REDIRECT_URI } };
  }
  if (grantType === 'refresh_token') {
    const refreshToken = form.get('refresh_token');
    if (!refreshToken) return { ok: false, error: 'invalid_request', description: 'Missing refresh token.' };
    return { ok: true, grant: { grant_type: grantType, refresh_token: refreshToken } };
  }
  return { ok: false, error: 'unsupported_grant_type', description: 'Only sign-in codes and refresh tokens are accepted.' };
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== TOKEN_PATH) return errorResponse(404, 'not_found', 'Not found.');
    if (request.method !== 'POST') {
      return errorResponse(405, 'invalid_request', 'Use POST.', { Allow: 'POST' });
    }

    const secret = env.GOOGLE_PHOTOS_CLIENT_SECRET;
    if (!secret) {
      return errorResponse(503, 'temporarily_unavailable', 'The Home Screens sign-in helper is not set up yet.');
    }

    if (env.TOKEN_LIMITER) {
      // Counted per network address for one minute by Cloudflare; not stored here.
      const key = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const { success } = await env.TOKEN_LIMITER.limit({ key });
      if (!success) {
        return errorResponse(429, 'rate_limited', 'Too many sign-in requests. Try again in a minute.', { 'Retry-After': '60' });
      }
    }

    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return errorResponse(413, 'invalid_request', 'Request too large.');
    }
    const result = toGoogleGrant(new URLSearchParams(text));
    if (!result.ok) return errorResponse(400, result.error, result.description);

    let upstream: Response;
    try {
      upstream = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: PHOTOS_CLIENT_ID, client_secret: secret, ...result.grant }),
      });
    } catch {
      return errorResponse(502, 'temporarily_unavailable', "Couldn't reach Google. Try again in a few minutes.");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  },
};

export default worker;
