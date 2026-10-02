/** Normalize singular rotation source and Immich filters to arrays. */

import type { ScreenConfiguration, Screen, BackgroundRotationSourceId } from '@/types/config';
import { mapConfigScreens } from './module-walk';

function convertRotation(screen: Screen): Screen {
  const rotation = screen.backgroundRotation as
    | (Screen['backgroundRotation'] & { source?: BackgroundRotationSourceId; immichAlbumId?: string; immichPersonId?: string })
    | undefined;
  if (!rotation) return screen;

  const { source, immichAlbumId, immichPersonId, ...rest } = rotation;
  return {
    ...screen,
    backgroundRotation: {
      ...rest,
      sources: rotation.enabled === false ? [] : rotation.sources ?? (source ? [source] : []),
      ...(immichAlbumId && !rotation.immichAlbumIds?.length ? { immichAlbumIds: [immichAlbumId] } : {}),
      ...(immichPersonId && !rotation.immichPersonIds?.length ? { immichPersonIds: [immichPersonId] } : {}),
    },
  };
}

export const v16ToV17 = {
  version: 17,
  description: 'backgroundRotation.source (singular) folded into backgroundRotation.sources (array)',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    version: 17,
    ...mapConfigScreens(config, convertRotation),
  }),
};
