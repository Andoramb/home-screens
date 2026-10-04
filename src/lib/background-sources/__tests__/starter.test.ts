import { describe, expect, it, vi } from 'vitest';
import { starterBackgroundsIn } from '@/lib/starter-backgrounds';
import type { BackgroundRotation } from '@/types/config';
import { backgroundSourceProviders, isSourceConfigured } from '..';

const rotation = (starterBackgroundIds?: BackgroundRotation['starterBackgroundIds']): BackgroundRotation => ({
  sources: ['theme', 'color', 'pattern'], query: '', intervalMinutes: 60, starterBackgroundIds,
});

describe('built-in starter rotation providers', () => {
  it.each(['theme', 'color', 'pattern'] as const)('%s defaults to the complete catalog when absent or empty', async (group) => {
    const walls = starterBackgroundsIn(group);
    expect(walls.length).toBeGreaterThan(1);
    const pick = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    try {
      expect(await backgroundSourceProviders[group].fetchRandom(rotation(), undefined)).toBe(walls.at(-1)?.path);
      expect(await backgroundSourceProviders[group].fetchRandom(rotation({ [group]: [] }), undefined)).toBe(walls.at(-1)?.path);
    } finally { pick.mockRestore(); }
  });

  it('respects a single ID, a multi-ID subset, and never escapes the chosen group', async () => {
    const colors = starterBackgroundsIn('color');
    const first = colors[0];
    const last = colors.at(-1)!;
    const chosen = rotation({ color: [first.id, 'theme-horizon', last.id, first.id] });
    const pick = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    try {
      expect(await backgroundSourceProviders.color.fetchRandom(chosen, undefined)).toBe(last.path);
      expect(await backgroundSourceProviders.color.fetchRandom(rotation({ color: [first.id] }), undefined)).toBe(first.path);
    } finally { pick.mockRestore(); }
  });

  it('skips invalid selections rather than accidentally falling back to all', async () => {
    const invalid = rotation({ theme: ['missing', 'midnight', 42 as never] });
    expect(isSourceConfigured('theme', invalid)).toBe(false);
    expect(await backgroundSourceProviders.theme.fetchRandom(invalid, undefined)).toBeNull();
    expect(isSourceConfigured('toString' as never, invalid)).toBe(false);
  });
});
