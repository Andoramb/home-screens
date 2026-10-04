import { describe, it, expect } from 'vitest';
import { isPrecipitating, precipitationOutlook } from '../precipitation';
import type { MinutelyPrecip } from '../types';

const minute = (intensity: number, probability?: number): MinutelyPrecip => ({ time: 0, intensity, probability });

/** An hour of minutes from a list of [intensity, probability] pairs, the rest repeating the last. */
function hour(...pairs: Array<[number, number?]>): MinutelyPrecip[] {
  return Array.from({ length: 60 }, (_, i) => {
    const [intensity, probability] = pairs[Math.min(i, pairs.length - 1)];
    return { time: i * 60, intensity, probability };
  });
}

describe('isPrecipitating', () => {
  it('calls trace and drizzle rates dry in either unit, up to and including the line', () => {
    expect(isPrecipitating(minute(0.0002, 90), 'imperial')).toBe(false);
    expect(isPrecipitating(minute(0.01, 90), 'imperial')).toBe(false);
    expect(isPrecipitating(minute(0.02, 90), 'imperial')).toBe(false);
    expect(isPrecipitating(minute(0.5, 90), 'metric')).toBe(false);
    expect(isPrecipitating(minute(0, 90), 'metric')).toBe(false);
  });

  it('counts a rate past drizzle with a real chance', () => {
    expect(isPrecipitating(minute(0.021, 40), 'imperial')).toBe(true);
    expect(isPrecipitating(minute(0.6, 40), 'metric')).toBe(true);
    expect(isPrecipitating(minute(1.2, 20), 'metric')).toBe(true);
  });

  it('reads the rate in the unit it was asked in', () => {
    // 0.3 is steady rain in inches but under the line in millimetres.
    expect(isPrecipitating(minute(0.3, 80), 'imperial')).toBe(true);
    expect(isPrecipitating(minute(0.3, 80), 'metric')).toBe(false);
  });

  it('calls an unlikely minute dry whatever its rate', () => {
    expect(isPrecipitating(minute(0.2, 9), 'imperial')).toBe(false);
    expect(isPrecipitating(minute(3, 19), 'metric')).toBe(false);
  });

  it('goes by the rate alone when the provider gives no chance', () => {
    expect(isPrecipitating(minute(0.05), 'imperial')).toBe(true);
    expect(isPrecipitating(minute(0.01), 'imperial')).toBe(false);
  });
});

describe('precipitationOutlook', () => {
  it('says dry for a clear hour full of trace readings', () => {
    // A clear Pirate Weather hour: tiny nonzero rates, single-digit chances.
    const clear = Array.from({ length: 60 }, (_, i) => minute(i % 7 === 0 ? 0.02 : 0.0002 * (i % 5), i % 10));
    expect(precipitationOutlook(clear, 'imperial')).toEqual({ kind: 'dry' });
  });

  it('says when rain under way stops', () => {
    expect(precipitationOutlook(hour([0.1, 90], [0.08, 80], [0.002, 70]), 'imperial')).toEqual({ kind: 'stopping', minutes: 2 });
  });

  it('says when rain starts', () => {
    expect(precipitationOutlook(hour([0, 0], [0, 0], [0, 0], [0.003, 30], [2, 70]), 'metric')).toEqual({ kind: 'starting', minutes: 4 });
  });

  it('says it keeps going when every minute counts', () => {
    expect(precipitationOutlook(hour([0.3, 95]), 'imperial')).toEqual({ kind: 'continuing' });
  });

  it('says dry for no minutes at all', () => {
    expect(precipitationOutlook([], 'metric')).toEqual({ kind: 'dry' });
  });
});
