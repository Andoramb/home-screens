import { describe, expect, it } from 'vitest';
import { daysToFullMoon, moonPhaseKey } from '../moon-phase-name';

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

describe('daysToFullMoon', () => {
  it('counts the days from the phase fraction to the next full moon', () => {
    expect(daysToFullMoon(0.5)).toBe(0);
    expect(daysToFullMoon(0.25)).toBe(7);
    expect(daysToFullMoon(0)).toBe(15);
    // Just past full: the next one is a whole lunation away.
    expect(daysToFullMoon(0.52)).toBe(29);
  });
});
