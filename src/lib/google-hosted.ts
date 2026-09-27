import { GOOGLE_TOKEN_URL, type HostedGoogleClient } from './google-token-store';

/**
 * Home Screens' own Google apps, so a household can connect Google without
 * creating a Google Cloud project of its own.
 *
 * Off until Google's review approves the apps: nothing here is offered
 * unless HS_GOOGLE_HOSTED=1. Even then a household's own Google app, saved in
 * Settings, always wins (google-token-store.ts), so turning this on changes
 * nothing for a household that already set one up.
 *
 * Client ids are public (they appear in every sign-in link). Secrets never
 * go in this repository:
 * - Calendar uses a "TVs and Limited Input devices" client, whose secret
 *   Google treats as not confidential. Release builds supply it through
 *   HS_GOOGLE_CALENDAR_CLIENT_SECRET, and without it hosted Calendar stays off.
 * - Photos uses a "Web application" client, whose secret stays in the
 *   sign-in helper (infrastructure/google-oauth-worker). Hubs send codes and
 *   refresh tokens there and it adds the secret on the way to Google.
 */

export const HOSTED_CALENDAR_CLIENT_ID =
  '529435319756-hgrtgtbc3va1tccdgio9b57a4fp6kl7c.apps.googleusercontent.com';
export const HOSTED_PHOTOS_CLIENT_ID =
  '529435319756-oejms0l610evvbed4mpljueobjtu91d9.apps.googleusercontent.com';

const PHOTOS_TOKEN_URL = 'https://auth.homescreens.dev/google/photos/token';

function hostedEnabled(): boolean {
  return process.env.HS_GOOGLE_HOSTED === '1';
}

export function hostedCalendarClient(): HostedGoogleClient | null {
  if (!hostedEnabled()) return null;
  const clientSecret = process.env.HS_GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!clientSecret) return null;
  return { clientId: HOSTED_CALENDAR_CLIENT_ID, clientSecret, tokenUrl: GOOGLE_TOKEN_URL };
}

export function hostedPhotosClient(): HostedGoogleClient | null {
  if (!hostedEnabled()) return null;
  // The override points a development hub at `wrangler dev`, or a test at a stub.
  const tokenUrl = process.env.HS_GOOGLE_PHOTOS_TOKEN_URL?.trim() || PHOTOS_TOKEN_URL;
  return { clientId: HOSTED_PHOTOS_CLIENT_ID, tokenUrl };
}
