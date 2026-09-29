/**
 * Migration 015 — background rotation sources became a set.
 *
 * A screen used to pick exactly one rotation source (`backgroundRotation.source`).
 * Rotation now draws uniformly at random from any number of simultaneously
 * enabled sources (`backgroundRotation.sources`). A screen still on the old
 * singular field gets it folded into a one-entry array; every other field on
 * `backgroundRotation` (query, unsplashCollections, intervalMinutes, the
 * Immich/iCloud filters) is preserved untouched.
 */

import type { ScreenConfiguration, Screen, BackgroundRotationSourceId } from '@/types/config';
import { mapConfigScreens } from './module-walk';

function convertRotation(screen: Screen): Screen {
  const rotation = screen.backgroundRotation as
    | (Screen['backgroundRotation'] & { source?: BackgroundRotationSourceId })
    | undefined;
  if (!rotation || !rotation.enabled || !('source' in rotation)) return screen;

  const { source, ...rest } = rotation;
  return {
    ...screen,
    backgroundRotation: {
      ...rest,
      sources: source ? [source] : [],
    },
  };
}

export const v14ToV15 = {
  version: 15,
  description: 'backgroundRotation.source (singular) folded into backgroundRotation.sources (array)',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    version: 15,
    ...mapConfigScreens(config, convertRotation),
  }),
};
