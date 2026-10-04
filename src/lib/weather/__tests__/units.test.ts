import { describe, it, expect } from 'vitest';
import { pressureForUnits } from '../units';

describe('pressureForUnits', () => {
  it('keeps whole hPa for metric households', () => {
    expect(pressureForUnits(1013.4, 'metric')).toEqual({ value: '1013', unit: 'hPa' });
  });

  it('reads inches of mercury to two decimals for imperial households', () => {
    expect(pressureForUnits(1013, 'imperial')).toEqual({ value: '29.91', unit: 'inHg' });
    expect(pressureForUnits(980, 'imperial')).toEqual({ value: '28.94', unit: 'inHg' });
  });
});
