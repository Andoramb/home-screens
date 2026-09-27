import { createGoogleTokenStore } from './google-token-store';
import { hostedCalendarClient, hostedPhotosClient } from './google-hosted';
import type { GoogleAppsStatus } from './google-apps';

/**
 * The two Google grant instances, in their own module rather than inside
 * google-auth.ts / google-picker.ts.
 *
 * Each store owns a serialized write queue for its file, so there must be
 * exactly one instance per path — a second handle would have its own queue
 * and could interleave a write with an in-flight token refresh. Anything that
 * needs a store (including the credential backup) imports it from here, which
 * also keeps google-auth.ts and the Google client library it loads off the
 * import path of callers that only need to read or write the tokens file.
 */

/** Google Calendar: device-code flow, "TVs and Limited Input devices" client. */
export const googleCalendarTokenStore = createGoogleTokenStore({
  tokensPath: 'data/google-tokens.json',
  clientIdKey: 'google_client_id',
  clientSecretKey: 'google_client_secret',
  hosted: hostedCalendarClient,
  missingCredentialsMessage:
    'Google Calendar needs both a Client ID and a Client Secret. Add them in Settings → API keys.',
  logName: 'google-auth',
});

/** Google Photos import: auth-code flow, "Web application" client. */
export const googlePickerTokenStore = createGoogleTokenStore({
  tokensPath: 'data/google-picker-tokens.json',
  clientIdKey: 'google_web_client_id',
  clientSecretKey: 'google_web_client_secret',
  hosted: hostedPhotosClient,
  missingCredentialsMessage:
    'Google Photos import needs both a Photos Import Client ID and Secret. Add them in Settings → API keys.',
  logName: 'google-picker',
});

/** Which app each integration signs in with, for the editor's Google screens. */
export async function getGoogleAppsStatus(): Promise<GoogleAppsStatus> {
  const [calendarMode, photosMode] = await Promise.all([
    googleCalendarTokenStore.getMode(),
    googlePickerTokenStore.getMode(),
  ]);
  return {
    calendar: { mode: calendarMode, hostedAvailable: googleCalendarTokenStore.hostedAvailable() },
    photos: { mode: photosMode, hostedAvailable: googlePickerTokenStore.hostedAvailable() },
  };
}
