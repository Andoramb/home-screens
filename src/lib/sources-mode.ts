import type { BackgroundRotation } from '@/types/config';

export type SourcesMode = 'single' | 'multiple';

/**
 * How the Sources area presents itself. An explicit `sourcesMode` wins.
 * Without one, a config with rotation sources is Multiple (it rotates), anything
 * else is Single (a fixed background, as the original picker saved it).
 *
 * Single is the original background picker: one fixed picture, no rotation.
 * It never edits `sources`, so Multiple's selection survives a round trip.
 */
export function effectiveSourcesMode(
  rotation: Pick<BackgroundRotation, 'sources' | 'sourcesMode'> | undefined,
): SourcesMode {
  if (rotation?.sourcesMode) return rotation.sourcesMode;
  return (rotation?.sources?.length ?? 0) > 0 ? 'multiple' : 'single';
}
