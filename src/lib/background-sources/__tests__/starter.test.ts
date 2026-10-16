import { describe, expect, it, vi } from 'vitest';
import { starterBackgroundsIn } from '@/lib/starter-backgrounds';
import type { BackgroundRotation } from '@/types/config';
import { backgroundSourceProviders, isSourceConfigured } from '..';

const rotation = (starterBackgroundIds?: BackgroundRotation['starterBackgroundIds']): BackgroundRotation => ({
  sources: ['theme', 'color', 'pattern'], query: '', intervalMinutes: 60, starterBackgroundIds,
});

describe('built-in starter rotation providers', () => {
  it.each(['theme', 'color', 'pattern'] as const)('%s is opt-in: absent or empty selection rotates nothing', async (group) => {
    expect(starterBackgroundsIn(group).length).toBeGreaterThan(1);
    expect(await backgroundSourceProviders[group].fetchRandom(rotation(), undefined)).toBeNull();
    expect(await backgroundSourceProviders[group].fetchRandom(rotation({ [group]: [] }), undefined)).toBeNull();
    expect(isSourceConfigured(group, rotation())).toBe(false);
    expect(isSourceConfigured(group, rotation({ [group]: [starterBackgroundsIn(group)[0].id] }))).toBe(true);
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
