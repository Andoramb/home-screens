import { describe, it, expect } from 'vitest';
import {
  parseHexToRgb,
  parseCssColorToRgb,
  parseCssColorAlpha,
  parseEditableColor,
  withCssColorAlpha,
} from '@/lib/hex-color';

describe('parseHexToRgb', () => {
  it('reads 3-, 6- and 8-digit hex', () => {
    expect(parseHexToRgb('#f00')).toEqual([255, 0, 0]);
    expect(parseHexToRgb('#ff8800')).toEqual([255, 136, 0]);
    expect(parseHexToRgb('#ff880066')).toEqual([255, 136, 0]);
  });

  it('refuses anything else', () => {
    expect(parseHexToRgb('rebeccapurple')).toBeNull();
    expect(parseHexToRgb('#ff88')).toBeNull();
  });
});

describe('parseCssColorToRgb', () => {
  it('reads the functional notations too', () => {
    expect(parseCssColorToRgb('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseCssColorToRgb('rgba(0, 0, 0, 0.4)')).toEqual([0, 0, 0]);
  });

  it('refuses notations the renderers cannot reason about', () => {
    expect(parseCssColorToRgb('hsl(200 50% 50%)')).toBeNull();
    expect(parseCssColorToRgb(undefined)).toBeNull();
  });
});

describe('parseCssColorAlpha', () => {
  it('reads the alpha an rgba() carries', () => {
    expect(parseCssColorAlpha('rgba(0, 0, 0, 0.4)')).toBe(0.4);
    expect(parseCssColorAlpha('rgba(0,0,0,.25)')).toBe(0.25);
    expect(parseCssColorAlpha('rgba(0, 0, 0, 1)')).toBe(1);
  });

  it('reads the alpha an 8-digit hex carries', () => {
    expect(parseCssColorAlpha('#000000ff')).toBe(1);
    expect(parseCssColorAlpha('#00000000')).toBe(0);
    expect(parseCssColorAlpha('#00000080')).toBeCloseTo(0.5, 2);
  });

  it('treats a colour with no alpha as fully opaque', () => {
    expect(parseCssColorAlpha('#112233')).toBe(1);
    expect(parseCssColorAlpha('rgb(1, 2, 3)')).toBe(1);
  });

  /* Nine modules ship `backgroundColor: 'transparent'`, so the colour controls
   * meet it constantly; CSS says it is rgba(0, 0, 0, 0). */
  it('reads transparent as fully see-through', () => {
    expect(parseCssColorAlpha('transparent')).toBe(0);
    expect(parseCssColorAlpha('  TRANSPARENT ')).toBe(0);
  });

  it('refuses a colour it cannot parse', () => {
    expect(parseCssColorAlpha('rebeccapurple')).toBeNull();
    expect(parseCssColorAlpha(undefined)).toBeNull();
  });
});

describe('parseEditableColor', () => {
  it('splits a colour into channels and alpha', () => {
    expect(parseEditableColor('#112233')).toEqual({ rgb: [17, 34, 51], alpha: 1 });
    expect(parseEditableColor('rgba(0, 0, 0, 0.4)')).toEqual({ rgb: [0, 0, 0], alpha: 0.4 });
  });

  /* The swatch drew white for a transparent background, so a module whose
   * default is transparent looked like a white card in the picker. */
  it('gives transparent black channels to edit from', () => {
    expect(parseEditableColor('transparent')).toEqual({ rgb: [0, 0, 0], alpha: 0 });
  });

  it('refuses a colour it cannot parse', () => {
    expect(parseEditableColor('rebeccapurple')).toBeNull();
    expect(parseEditableColor(undefined)).toBeNull();
  });
});

describe('withCssColorAlpha', () => {
  /* Fully opaque stays the tidy hex people recognize; anything else has to be
   * rgba(), which is the notation every renderer downstream can read. */
  it('writes a plain hex at full opacity', () => {
    expect(withCssColorAlpha('#112233', 1)).toBe('#112233');
    expect(withCssColorAlpha('rgba(17, 34, 51, 0.4)', 1)).toBe('#112233');
  });

  it('writes rgba() below full opacity', () => {
    expect(withCssColorAlpha('#000000', 0.4)).toBe('rgba(0, 0, 0, 0.4)');
    expect(withCssColorAlpha('rgb(255, 136, 0)', 0)).toBe('rgba(255, 136, 0, 0)');
  });

  it('rounds to two decimals rather than storing slider noise', () => {
    expect(withCssColorAlpha('#000000', 0.3333333)).toBe('rgba(0, 0, 0, 0.33)');
  });

  it('clamps out-of-range alpha', () => {
    expect(withCssColorAlpha('#000000', 2)).toBe('#000000');
    expect(withCssColorAlpha('#000000', -1)).toBe('rgba(0, 0, 0, 0)');
  });

  /* Turning a transparent background up has to give it a colour to be; CSS
   * transparent is black at zero alpha, so that is the one it already was. */
  it('turns transparent up into black', () => {
    expect(withCssColorAlpha('transparent', 0.4)).toBe('rgba(0, 0, 0, 0.4)');
    expect(withCssColorAlpha('transparent', 1)).toBe('#000000');
    expect(withCssColorAlpha('transparent', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('refuses a colour it cannot parse', () => {
    expect(withCssColorAlpha('rebeccapurple', 0.5)).toBeNull();
  });
});
