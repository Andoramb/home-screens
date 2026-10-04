export type { BackgroundSourceProvider, Canvas } from './types';
export { unsplashSourceProvider } from './unsplash';
export { nasaApodSourceProvider } from './nasa-apod';
export { immichSourceProvider } from './immich';
export { icloudSourceProvider } from './icloud';
export { localSourceProvider } from './local';
export { themeSourceProvider, colorSourceProvider, patternSourceProvider, starterCandidates } from './starter';

import { unsplashSourceProvider } from './unsplash';
import { nasaApodSourceProvider } from './nasa-apod';
import { immichSourceProvider } from './immich';
import { icloudSourceProvider } from './icloud';
import { localSourceProvider } from './local';
import { themeSourceProvider, colorSourceProvider, patternSourceProvider, starterCandidates } from './starter';
import type { BackgroundSourceProvider } from './types';
import type { BackgroundRotation, BackgroundRotationSourceId } from '@/types/config';
import { isUnsplashCollectionsMode } from '@/lib/unsplash-rotation-mode';

export const backgroundSourceProviders: Record<BackgroundRotationSourceId, BackgroundSourceProvider> = {
  unsplash: unsplashSourceProvider,
  'nasa-apod': nasaApodSourceProvider,
  immich: immichSourceProvider,
  icloud: icloudSourceProvider,
  local: localSourceProvider,
  theme: themeSourceProvider,
  color: colorSourceProvider,
  pattern: patternSourceProvider,
};

export function isSourceConfigured(source: BackgroundRotationSourceId, rotation: BackgroundRotation): boolean {
  if (source === 'theme' || source === 'color' || source === 'pattern') {
    return starterCandidates(source, rotation).length > 0;
  }
  if (source === 'unsplash') {
    return isUnsplashCollectionsMode(rotation) ? !!rotation.unsplashCollections?.length : !!rotation.query;
  }
  return Object.hasOwn(backgroundSourceProviders, source);
}
