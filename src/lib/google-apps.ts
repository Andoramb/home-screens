import type { GoogleClientMode } from './google-token-store';

/**
 * Which Google app each integration signs in with, as the hub reports it
 * (GET /api/auth/google/apps). Types only, so editor components can import
 * them without pulling in the server-side token store.
 */
export interface GoogleAppState {
  /** The app sign-ins use now: the household's own, Home Screens', or none usable. */
  mode: GoogleClientMode | null;
  /**
   * Home Screens' own app is on for this integration (HS_GOOGLE_HOSTED), even
   * when a household's own app wins. Every new sign-in screen waits on this,
   * so a hub with the switch off shows exactly what it always has.
   */
  hostedAvailable: boolean;
}

export interface GoogleAppsStatus {
  calendar: GoogleAppState;
  photos: GoogleAppState;
}

/**
 * The one switch for every new Google sign-in screen: Home Screens' own app
 * is on for either integration. Null (not loaded, or the request failed)
 * counts as off.
 */
export function hostedSignInOn(apps: GoogleAppsStatus | null): boolean {
  return !!apps && (apps.calendar.hostedAvailable || apps.photos.hostedAvailable);
}
