import { starterBackgroundsIn, type StarterBackgroundGroup } from '@/lib/starter-backgrounds';
import type { BackgroundRotation } from '@/types/config';
import type { BackgroundSourceProvider } from './types';

/** Resolve selections against the catalog; never turn a nonempty, invalid selection into "all". */
export function starterCandidates(group: StarterBackgroundGroup, rotation: BackgroundRotation) {
  const catalog = starterBackgroundsIn(group);
  const selected = rotation.starterBackgroundIds?.[group];
  if (!Array.isArray(selected) || selected.length === 0) return catalog;
  const ids = new Set(selected.filter((id): id is string => typeof id === 'string'));
  return catalog.filter((wall) => ids.has(wall.id));
}

function starterProvider(group: StarterBackgroundGroup): BackgroundSourceProvider {
  return {
    id: group,
    async fetchRandom(rotation) {
      const candidates = starterCandidates(group, rotation);
      if (!candidates.length) return null;
      return candidates[Math.floor(Math.random() * candidates.length)]?.path ?? null;
    },
  };
}

export const themeSourceProvider = starterProvider('theme');
export const colorSourceProvider = starterProvider('color');
export const patternSourceProvider = starterProvider('pattern');
