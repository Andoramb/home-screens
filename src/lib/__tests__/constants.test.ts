import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  snapToGrid,
  GRID_SIZE,
  RESOLUTION_PRESETS,
  deriveDisplayTransform,
  DISPLAY_BACKGROUND,
} from '../constants';

describe('snapToGrid', () => {
  it('snaps exact multiples to themselves', () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(GRID_SIZE)).toBe(GRID_SIZE);
    expect(snapToGrid(GRID_SIZE * 5)).toBe(GRID_SIZE * 5);
  });

  it('rounds to nearest grid line', () => {
    expect(snapToGrid(GRID_SIZE / 2 - 1)).toBe(0);
    expect(snapToGrid(GRID_SIZE / 2)).toBe(GRID_SIZE);
    expect(snapToGrid(GRID_SIZE + 1)).toBe(GRID_SIZE);
    expect(snapToGrid(GRID_SIZE * 2 - 1)).toBe(GRID_SIZE * 2);
  });

  it('handles negative values', () => {
    // Math.round has positive bias at midpoints: Math.round(-0.5) === 0
    expect(snapToGrid(-1)).toEqual(expect.closeTo(0, 0));
    expect(snapToGrid(-GRID_SIZE)).toBe(-GRID_SIZE);
    // -10/20 = -0.5, Math.round(-0.5) = 0, so this snaps to 0, not -GRID_SIZE
    expect(snapToGrid(-GRID_SIZE / 2)).toEqual(expect.closeTo(0, 0));
    // Past midpoint rounds down
    expect(snapToGrid(-GRID_SIZE / 2 - 1)).toBe(-GRID_SIZE);
  });
});

describe('RESOLUTION_PRESETS', () => {
  it('has correct structure with short < long for each entry', () => {
    expect(RESOLUTION_PRESETS.length).toBeGreaterThan(0);
    for (const p of RESOLUTION_PRESETS) {
      expect(p).toHaveProperty('label');
      expect(p).toHaveProperty('short');
      expect(p).toHaveProperty('long');
      expect(p.short).toBeLessThan(p.long);
    }
  });

  it('has unique short values (used as select keys)', () => {
    const shorts = RESOLUTION_PRESETS.map((p) => p.short);
    expect(new Set(shorts).size).toBe(shorts.length);
  });
});

describe('DISPLAY_BACKGROUND', () => {
  const CANVAS = 'src/components/editor/EditorCanvas.tsx';
  const RENDERER = 'src/components/display/ScreenRenderer.tsx';

  it('is the black the wall actually paints', () => {
    expect(DISPLAY_BACKGROUND).toBe('#000');
  });

  // The editor canvas painted a navy while the wall painted black, so every
  // transparency and text-colour judgement was made against a ground the wall
  // does not have. Both now read this constant; a literal creeping back into
  // either file is how they drift apart again.
  it('is what the editor canvas and the screen renderer both paint', () => {
    for (const file of [CANVAS, RENDERER]) {
      expect(readFileSync(file, 'utf8')).toContain('DISPLAY_BACKGROUND');
    }
  });

  it('leaves no hard-coded ground colour behind in either file', () => {
    for (const file of [CANVAS, RENDERER]) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('#0f172a');
      expect(source).not.toMatch(/backgroundColor:\s*['"]#/);
    }
  });
});

describe('deriveDisplayTransform', () => {
  it('maps portrait + not flipped to 90', () => {
    expect(deriveDisplayTransform('portrait', false)).toBe('90');
  });

  it('maps portrait + flipped to 270', () => {
    expect(deriveDisplayTransform('portrait', true)).toBe('270');
  });

  it('maps landscape + not flipped to normal', () => {
    expect(deriveDisplayTransform('landscape', false)).toBe('normal');
  });

  it('maps landscape + flipped to 180', () => {
    expect(deriveDisplayTransform('landscape', true)).toBe('180');
  });
});
