import type { BackgroundRotation, BackgroundRotationSourceId } from '@/types/config';

export type SourcesMode = 'single' | 'multiple';

/**
 * How the Sources area presents rotation sources. An explicit `sourcesMode` wins;
 * existing configs without one are Multiple when more than one source is on, else Single.
 */
export function effectiveSourcesMode(
  rotation: Pick<BackgroundRotation, 'sources' | 'sourcesMode'> | undefined,
): SourcesMode {
  if (rotation?.sourcesMode) return rotation.sourcesMode;
  return (rotation?.sources?.length ?? 0) > 1 ? 'multiple' : 'single';
}

/** Sources to keep after switching mode: Single keeps only the first enabled one. */
export function sourcesForMode(sources: BackgroundRotationSourceId[], mode: SourcesMode): BackgroundRotationSourceId[] {
  return mode === 'single' ? sources.slice(0, 1) : sources;
}
