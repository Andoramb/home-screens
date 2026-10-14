import type { GlobalSettings, GoogleAppPreference } from '@/types/config';
import type { GoogleClientMode } from './google-token-store';

/**
 * Which Google app an integration signs in with. One rule for the hub's token
 * stores and the editor's Google card, so the two cannot drift.
 *
 * A household that saved its own app (any half of a pair) uses it unless it
 * flipped the switch to Home Screens' app, which keeps the saved details for
 * later. Without saved details Home Screens' app is used whenever it is
 * available. The switch can never strand a hub: with Home Screens' app
 * unavailable (HS_GOOGLE_HOSTED=0) saved details are used whatever it says.
 */

export const DEFAULT_GOOGLE_APP: GoogleAppPreference = 'own';

/** The household's choice; an unset setting means its own app, the rule before the switch existed. */
export function googleAppPreference(
  settings: Pick<GlobalSettings, 'googleApp'> | null | undefined,
): GoogleAppPreference {
  return settings?.googleApp ?? DEFAULT_GOOGLE_APP;
}

export function chooseGoogleApp(input: {
  ownSaved: boolean;
  preference: GoogleAppPreference;
  hostedAvailable: boolean;
}): GoogleClientMode | null {
  if (input.ownSaved && (input.preference === 'own' || !input.hostedAvailable)) return 'own';
  if (input.hostedAvailable) return 'hosted';
  return null;
}
