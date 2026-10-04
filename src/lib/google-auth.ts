import type { auth as googleAuth } from '@googleapis/calendar';
import { fetchWithTimeout } from '@/lib/api-utils';
import { SignInHelperUnreachableError, type GoogleClientMode, type StoredGoogleTokens } from '@/lib/google-token-store';
import { googleCalendarTokenStore } from '@/lib/google-token-stores';
import { logger } from '@/lib/logger';
import { bumpCalendarRevision } from '@/lib/calendar-revision';

const log = logger('google-auth');

/** Google Calendar auth: the OAuth device-code flow lives here; holding the
 *  grant (persistence, proactive refresh, revocation) lives in the shared
 *  google-token-store, which the Google Photos importer also uses. */
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// ── Device Flow ──────────────────────────────────────────────────────
// Google's device authorization endpoint (no redirect URI needed)
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';

const store = googleCalendarTokenStore;

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

/** Request a device code + user code from Google. */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const clientId = await store.getClientId();
  if (!clientId) throw new Error('Google Calendar Client ID is not configured. Add it in Settings → API keys.');

  const res = await fetchWithTimeout(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: SCOPES.join(' '),
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error_description || err.error || 'Failed to request device code');
  }

  return res.json();
}

/** Poll Google's token endpoint for a device code grant. */
export async function pollDeviceToken(
  deviceCode: string,
): Promise<{ status: 'pending' | 'success' | 'expired' | 'denied'; error?: string }> {
  let result: Awaited<ReturnType<typeof store.requestToken>>;
  try {
    result = await store.requestToken({
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
  } catch (err) {
    // Home Screens' sign-in helper could not be reached. The code on screen
    // is still good for its whole lifetime, so keep waiting rather than end
    // a sign-in the family may be halfway through.
    if (err instanceof SignInHelperUnreachableError) return { status: 'pending' };
    throw err;
  }
  const { ok, status: httpStatus, data: body, client } = result;
  const data = body as StoredGoogleTokens & { expires_in?: number; error?: string; error_description?: string };
  // Busy or briefly down (Google, or the helper's rate limit): same reason.
  if (!ok && (httpStatus === 429 || httpStatus >= 500)) return { status: 'pending' };

  if (ok && data.access_token) {
    // Success — convert expires_in (relative seconds) to expiry_date (absolute ms)
    // so getAuthenticatedClient() can proactively refresh before expiry
    if (data.expires_in && !data.expiry_date) {
      data.expiry_date = Date.now() + data.expires_in * 1000;
    }
    await store.saveGrant(data, client);
    bumpCalendarRevision();
    if (!data.refresh_token) {
      return {
        status: 'success',
        error: 'Google did not return a refresh token — calendar will stop updating when the access token expires (~1 hour). To fix: revoke access at myaccount.google.com/permissions, then sign in again.',
      };
    }
    return { status: 'success' };
  }

  // Handle known polling states
  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return { status: 'pending' };
  }
  if (data.error === 'expired_token') {
    return { status: 'expired', error: 'Code expired. Please try again.' };
  }
  if (data.error === 'access_denied') {
    return { status: 'denied', error: 'Access was denied.' };
  }

  return { status: 'denied', error: data.error_description || data.error || 'Unknown error' };
}

export async function loadTokens(): Promise<StoredGoogleTokens | null> {
  return store.loadTokens();
}

/**
 * A Google Calendar client carrying a currently valid access token. Refresh
 * is handled by the token store before the client is built, so the client
 * itself never needs to refresh mid-call. The client library is loaded here
 * rather than at the top of the file: the sign-in routes share this file and
 * are all plain `fetch`, so opening Settings > Calendar loads none of it.
 */
export async function getAuthenticatedClient(): Promise<InstanceType<typeof googleAuth.OAuth2> | null> {
  const accessToken = await store.getAccessToken();
  if (!accessToken) {
    log.error('No usable Google tokens (missing, expired without refresh token, or refresh rejected)');
    return null;
  }
  const { clientId, clientSecret } = await store.getClient();
  const { auth } = await import('@googleapis/calendar');
  const client = new auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ access_token: accessToken });
  return client;
}

export async function isAuthenticated(): Promise<boolean> {
  return store.isConnected();
}

export async function disconnect(): Promise<void> {
  await store.disconnect();
  bumpCalendarRevision();
}

export async function hasGoogleCredentials(): Promise<boolean> {
  return store.hasCredentials();
}

/** Which app Calendar signs in with; the editor shows its new sign-in screens only for Home Screens' app. */
export async function getCalendarSignInMode(): Promise<GoogleClientMode | null> {
  return store.getMode();
}
