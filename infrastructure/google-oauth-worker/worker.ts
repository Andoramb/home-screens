/**
 * Home Screens Google sign-in helper
 *
 * Holds the client secrets of Home Screens' own Google apps, so no secret
 * ships inside software people install:
 * - Photos is a "Web application" client (the Photos Picker scope is refused
 *   by Google's device flow). Google's policy is that a web client's secret
 *   stays on a server.
 * - Calendar is a "TVs and Limited Input devices" client. Hubs ask Google for
 *   the short code themselves (that needs only the public client id); the
 *   secret is needed to collect the finished sign-in and to renew it, so
 *   those two come through here. Keeping it here means it can be replaced or
 *   switched off in one command instead of a release.
 * Hubs send their token requests here and this Worker adds the secret on the
 * way to Google.
 *
 * Hubs keep their own tokens. This Worker stores nothing and logs no request
 * or response bodies (they carry sign-in codes and refresh tokens).
 *
 * Two endpoints, form-encoded, each accepting only its app's steps:
 *   POST /google/photos/token
 *     grant_type=authorization_code with code        (signing in; the hub's
 *       code_verifier comes along when its sign-in link carried PKCE)
 *     grant_type=refresh_token with refresh_token    (renewing a sign-in)
 *   POST /google/calendar/token
 *     grant_type=urn:ietf:params:oauth:grant-type:device_code with device_code
 *                                                    (collecting a sign-in)
 *     grant_type=refresh_token with refresh_token    (renewing a sign-in)
 * Google's answer comes back unchanged. Errors this Worker raises itself use
 * Google's own shape ({ error, error_description }) so hubs show them the
 * same way.
 *
 * Deploy:
 *   npx wrangler secret put GOOGLE_PHOTOS_CLIENT_SECRET
 *   npx wrangler secret put GOOGLE_CALENDAR_CLIENT_SECRET
 *   npx wrangler deploy
 */

import { CALENDAR_CLIENT_ID, DEVICE_CODE_GRANT, PHOTOS_CLIENT_ID, REDIRECT_URI } from './config';

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  GOOGLE_PHOTOS_CLIENT_SECRET?: string;
  GOOGLE_CALENDAR_CLIENT_SECRET?: string;
  TOKEN_LIMITER?: RateLimiter;
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** A code or refresh token is a few hundred bytes; nothing legitimate comes close. */
const MAX_BODY_BYTES = 8_192;
/** RFC 7636's code_verifier: 43 to 128 unreserved characters. */
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

function errorResponse(status: number, error: string, description: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

type GrantResult =
  | { ok: true; grant: Record<string, string> }
  | { ok: false; error: string; description: string };

function refreshGrant(form: URLSearchParams): GrantResult {
  const refreshToken = form.get('refresh_token');
  if (!refreshToken) return { ok: false, error: 'invalid_request', description: 'Missing refresh token.' };
  return { ok: true, grant: { grant_type: 'refresh_token', refresh_token: refreshToken } };
}

/**
 * One of Home Screens' Google apps. `toGrant` rebuilds the request from
 * scratch with only the fields Google needs: nothing else a caller sends
 * (another app's id, a secret, a return page, a scope) is passed on.
 */
interface HostedApp {
  clientId: string;
  secret: (env: Env) => string | undefined;
  toGrant: (form: URLSearchParams) => GrantResult;
}

const APPS: Record<string, HostedApp> = {
  '/google/photos/token': {
    clientId: PHOTOS_CLIENT_ID,
    secret: (env) => env.GOOGLE_PHOTOS_CLIENT_SECRET,
    toGrant: (form) => {
      const grantType = form.get('grant_type');
      if (grantType === 'authorization_code') {
        const code = form.get('code');
        if (!code) return { ok: false, error: 'invalid_request', description: 'Missing sign-in code.' };
        const grant: Record<string, string> = { grant_type: grantType, code, redirect_uri: REDIRECT_URI };
        // A hub that sends people straight back to itself signs in with
        // PKCE, and Google then refuses the code without its verifier.
        const verifier = form.get('code_verifier');
        if (verifier !== null) {
          if (!CODE_VERIFIER.test(verifier)) {
            return { ok: false, error: 'invalid_request', description: 'Malformed code verifier.' };
          }
          grant.code_verifier = verifier;
        }
        return { ok: true, grant };
      }
      if (grantType === 'refresh_token') return refreshGrant(form);
      return { ok: false, error: 'unsupported_grant_type', description: 'Only sign-in codes and refresh tokens are accepted.' };
    },
  },
  '/google/calendar/token': {
    clientId: CALENDAR_CLIENT_ID,
    secret: (env) => env.GOOGLE_CALENDAR_CLIENT_SECRET,
    toGrant: (form) => {
      const grantType = form.get('grant_type');
      if (grantType === DEVICE_CODE_GRANT) {
        const deviceCode = form.get('device_code');
        if (!deviceCode) return { ok: false, error: 'invalid_request', description: 'Missing device code.' };
        return { ok: true, grant: { grant_type: grantType, device_code: deviceCode } };
      }
      if (grantType === 'refresh_token') return refreshGrant(form);
      return { ok: false, error: 'unsupported_grant_type', description: 'Only device codes and refresh tokens are accepted.' };
    },
  },
};

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const app = Object.hasOwn(APPS, url.pathname) ? APPS[url.pathname] : undefined;
    if (!app) return errorResponse(404, 'not_found', 'Not found.');
    if (request.method !== 'POST') {
      return errorResponse(405, 'invalid_request', 'Use POST.', { Allow: 'POST' });
    }

    const secret = app.secret(env);
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
    const result = app.toGrant(new URLSearchParams(text));
    if (!result.ok) return errorResponse(400, result.error, result.description);

    let upstream: Response;
    try {
      upstream = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: app.clientId, client_secret: secret, ...result.grant }),
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
