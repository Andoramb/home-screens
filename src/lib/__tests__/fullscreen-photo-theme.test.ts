import { describe, it, expect } from 'vitest';
import {
  photoThemeTokens,
  autoClockBackdropColor,
  defaultClockBackdrop,
  clockOverlayPaint,
} from '../fullscreen-photo-theme';
import { getThemeTokens } from '../fullscreen-themes';

const linen = getThemeTokens('linen');
const midnight = getThemeTokens('midnight');

/** The alpha at the bottom edge and at the 60% stop of a backdrop gradient. */
function stops(background: string | undefined): [number, number] {
  const alphas = [...(background ?? '').matchAll(/rgba\(\d+,\d+,\d+,([\d.]+)\)/g)].map((m) => Number(m[1]));
  expect(alphas).toHaveLength(2);
  return [alphas[0], alphas[1]];
}

/** The color channels a backdrop gradient is drawn in. */
function channels(background: string | undefined): string | undefined {
  return background?.match(/rgba\((\d+,\d+,\d+),/)?.[1];
}

describe('photoThemeTokens', () => {
  it('prefers the module theme, then the display theme, then Midnight', () => {
    expect(photoThemeTokens('paper', 'slate')).toEqual(getThemeTokens('paper'));
    expect(photoThemeTokens(undefined, 'slate')).toEqual(getThemeTokens('slate'));
    expect(photoThemeTokens(undefined, undefined)).toEqual(getThemeTokens('midnight'));
  });
});

describe('clockOverlayPaint on the theme\'s own backdrop', () => {
  it('draws the theme\'s own fade and text when the module sets nothing', () => {
    expect(clockOverlayPaint(linen, {})).toEqual({
      background: 'linear-gradient(to top, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.38) 60%, transparent 100%)',
      text: linen.text,
      textSecondary: linen.textSecondary,
    });
    expect(clockOverlayPaint(midnight, {})).toEqual({
      background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)',
      text: midnight.text,
      textSecondary: midnight.textSecondary,
    });
  });

  it('shows white on light themes and black on dark ones in the editor swatch', () => {
    expect(autoClockBackdropColor(linen)).toBe('#ffffff');
    expect(autoClockBackdropColor(midnight)).toBe('#000000');
  });

  it('starts the slider at 72 on light themes and 55 on dark ones, which draws the same fade', () => {
    expect(defaultClockBackdrop(linen, undefined)).toBe(72);
    expect(defaultClockBackdrop(midnight, undefined)).toBe(55);
    for (const theme of [linen, midnight]) {
      expect(clockOverlayPaint(theme, { clockBackdrop: defaultClockBackdrop(theme, undefined) }))
        .toEqual(clockOverlayPaint(theme, {}));
    }
  });

  it('draws no backdrop at 0 and keeps the text', () => {
    expect(clockOverlayPaint(linen, { clockBackdrop: 0 })).toEqual({
      background: undefined,
      text: linen.text,
      textSecondary: linen.textSecondary,
    });
  });

  it('is a solid band behind the clock at 100', () => {
    expect(stops(clockOverlayPaint(linen, { clockBackdrop: 100 }).background)).toEqual([1, 1]);
    expect(stops(clockOverlayPaint(midnight, { clockBackdrop: 100 }).background)).toEqual([1, 1]);
  });

  it('keeps the fade\'s shape below the backdrop\'s own strength and only thins it', () => {
    // Half of linen's 72 is half of both stops.
    expect(stops(clockOverlayPaint(linen, { clockBackdrop: 36 }).background)).toEqual([0.36, 0.19]);
  });

  it('raises the middle of the fade faster than the edge above the backdrop\'s own strength', () => {
    // 86 is halfway from 72 to 100, so the middle is halfway from 0.38 to 1.
    expect(stops(clockOverlayPaint(linen, { clockBackdrop: 86 }).background)).toEqual([0.86, 0.69]);
  });

  it('only ever gets more solid as the slider moves right', () => {
    for (const theme of [linen, midnight]) {
      let previous: [number, number] = [0, 0];
      for (let value = 5; value <= 100; value += 5) {
        const current = stops(clockOverlayPaint(theme, { clockBackdrop: value }).background);
        expect(current[0]).toBeGreaterThan(previous[0]);
        expect(current[1]).toBeGreaterThan(previous[1]);
        previous = current;
      }
    }
  });

  it('holds a hand-edited strength outside 0-100 at the nearest end, and ignores one that is not a number', () => {
    expect(clockOverlayPaint(linen, { clockBackdrop: 150 })).toEqual(clockOverlayPaint(linen, { clockBackdrop: 100 }));
    expect(clockOverlayPaint(linen, { clockBackdrop: -20 }).background).toBeUndefined();
    expect(clockOverlayPaint(linen, { clockBackdrop: Number.NaN })).toEqual(clockOverlayPaint(linen, {}));
    expect(clockOverlayPaint(linen, { clockBackdrop: '90' as unknown as number })).toEqual(clockOverlayPaint(linen, {}));
  });
});

describe('clockOverlayPaint on a picked color', () => {
  it('writes light text on a dark pick and gives it the dark backdrop\'s strength', () => {
    const paint = clockOverlayPaint(linen, { clockBackdropColor: '#1e3a8a' });
    expect(channels(paint.background)).toBe('30,58,138');
    expect(stops(paint.background)).toEqual([0.55, 0.25]);
    expect(paint.text).toBe('#ffffff');
    expect(paint.textSecondary).toBe('rgba(255, 255, 255, 0.8)');
    expect(defaultClockBackdrop(linen, '#1e3a8a')).toBe(55);
  });

  it('writes dark text on a light pick and gives it the light backdrop\'s strength', () => {
    const paint = clockOverlayPaint(midnight, { clockBackdropColor: '#fde68a' });
    expect(channels(paint.background)).toBe('253,230,138');
    expect(stops(paint.background)).toEqual([0.72, 0.38]);
    expect(paint.text).toBe('#1c1917');
    expect(paint.textSecondary).toBe('rgba(28, 25, 23, 0.8)');
    expect(defaultClockBackdrop(midnight, '#fde68a')).toBe(72);
  });

  it('follows the Clock Background strength on a picked color too', () => {
    expect(stops(clockOverlayPaint(linen, { clockBackdropColor: '#1e3a8a', clockBackdrop: 100 }).background)).toEqual([1, 1]);
    expect(clockOverlayPaint(linen, { clockBackdropColor: '#1e3a8a', clockBackdrop: 0 }).background).toBeUndefined();
  });

  it('reads every notation the color box accepts the same way, and drops the pick\'s own alpha', () => {
    const hex = clockOverlayPaint(midnight, { clockBackdropColor: '#fde68a' });
    for (const same of ['#FDE68A', 'fde68a', 'rgb(253, 230, 138)', 'rgba(253, 230, 138, 0.3)', '#fde68a80']) {
      expect(clockOverlayPaint(midnight, { clockBackdropColor: same })).toEqual(hex);
    }
  });

  it('falls back to the theme\'s own backdrop for a color it cannot read', () => {
    for (const unreadable of ['blue', 'hsl(220 60% 30%)', '', 'not a color']) {
      expect(clockOverlayPaint(linen, { clockBackdropColor: unreadable })).toEqual(clockOverlayPaint(linen, {}));
    }
  });
});
