import type { GoogleAppPreference } from '@/types/config';
import { readConfig } from './config';
import { googleAppPreference } from './google-app-choice';

/**
 * The household's Google app choice as saved in config.json, for the token
 * stores. Its own module so tests of the stores can stand it in without
 * touching the config store.
 */
export async function readGoogleAppPreference(): Promise<GoogleAppPreference> {
  return googleAppPreference((await readConfig()).settings);
}
