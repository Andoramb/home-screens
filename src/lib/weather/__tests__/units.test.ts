import { describe, it, expect } from 'vitest';
import { compassToDegrees, pressureForUnits } from '../units';

describe('compassToDegrees', () => {
  it('maps the four cardinal points', () => {
    expect(compassToDegrees('N')).toBe(0);
    expect(compassToDegrees('E')).toBe(90);
    expect(compassToDegrees('S')).toBe(180);
    expect(compassToDegrees('W')).toBe(270);
  });

  it('maps the full 16-point rose in 22.5 degree steps', () => {
    expect(compassToDegrees('NNE')).toBe(22.5);
    expect(compassToDegrees('NE')).toBe(45);
    expect(compassToDegrees('ENE')).toBe(67.5);
    expect(compassToDegrees('ESE')).toBe(112.5);
    expect(compassToDegrees('SE')).toBe(135);
    expect(compassToDegrees('SSE')).toBe(157.5);
    expect(compassToDegrees('SSW')).toBe(202.5);
    expect(compassToDegrees('SW')).toBe(225);
    expect(compassToDegrees('WSW')).toBe(247.5);
    expect(compassToDegrees('WNW')).toBe(292.5);
    expect(compassToDegrees('NW')).toBe(315);
    expect(compassToDegrees('NNW')).toBe(337.5);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(compassToDegrees(' nw ')).toBe(315);
    expect(compassToDegrees('sse')).toBe(157.5);
  });

  it('is undefined for blank, variable or unknown text', () => {
    expect(compassToDegrees('')).toBeUndefined();
    expect(compassToDegrees('VRB')).toBeUndefined();
    expect(compassToDegrees('Northwest')).toBeUndefined();
  });
});

describe('pressureForUnits', () => {
  it('keeps whole hPa for metric households', () => {
    expect(pressureForUnits(1013.4, 'metric')).toEqual({ value: '1013', unit: 'hPa' });
  });

  it('reads inches of mercury to two decimals for imperial households', () => {
    expect(pressureForUnits(1013, 'imperial')).toEqual({ value: '29.91', unit: 'inHg' });
    expect(pressureForUnits(980, 'imperial')).toEqual({ value: '28.94', unit: 'inHg' });
  });
});
