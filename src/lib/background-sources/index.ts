export type { BackgroundSourceProvider, Canvas } from './types';
export { unsplashSourceProvider } from './unsplash';
export { nasaApodSourceProvider } from './nasa-apod';
export { immichSourceProvider } from './immich';
export { icloudSourceProvider } from './icloud';
export { localSourceProvider } from './local';

import { unsplashSourceProvider } from './unsplash';
import { nasaApodSourceProvider } from './nasa-apod';
import { immichSourceProvider } from './immich';
import { icloudSourceProvider } from './icloud';
import { localSourceProvider } from './local';
import type { BackgroundSourceProvider } from './types';
import type { BackgroundRotation, BackgroundRotationSourceId } from '@/types/config';

export const backgroundSourceProviders: Record<BackgroundRotationSourceId, BackgroundSourceProvider> = {
  unsplash: unsplashSourceProvider,
  'nasa-apod': nasaApodSourceProvider,
  immich: immichSourceProvider,
  icloud: icloudSourceProvider,
  local: localSourceProvider,
};

export function isSourceConfigured(source: BackgroundRotationSourceId, rotation: BackgroundRotation): boolean {
  if (source === 'unsplash') return !!rotation.query || !!rotation.unsplashCollections?.length;
  return true;
}
