import { describe, expect, it } from 'vitest';
import { moonPhaseKey } from '../moon-phase-name';

describe('moonPhaseKey', () => {
  it('names the eight phases from SunCalc\'s 0..1 fraction', () => {
    expect(moonPhaseKey(0)).toBe('new');
    expect(moonPhaseKey(0.99)).toBe('new');
    expect(moonPhaseKey(0.15)).toBe('waxingCrescent');
    expect(moonPhaseKey(0.25)).toBe('firstQuarter');
    expect(moonPhaseKey(0.4)).toBe('waxingGibbous');
    expect(moonPhaseKey(0.5)).toBe('full');
    expect(moonPhaseKey(0.6)).toBe('waningGibbous');
    expect(moonPhaseKey(0.75)).toBe('lastQuarter');
    expect(moonPhaseKey(0.9)).toBe('waningCrescent');
  });
});
