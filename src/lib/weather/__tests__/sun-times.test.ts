import { describe, expect, it } from 'vitest';
import { ALWAYS_DAY, isNightHour, sunTimesFor } from '../sun-times';

// Prior Lake, MN on an October afternoon: sunrise about 7:26, sunset about 6:27 local.
const PRIOR_LAKE = { lat: 44.7133, lon: -93.4227, tz: 'America/Chicago' };
const OCT_AFTERNOON = new Date('2026-10-15T19:10:00Z'); // 14:10 CDT

describe('sunTimesFor', () => {
  it('finds today\'s window and places it on the display clock', () => {
    const sun = sunTimesFor(OCT_AFTERNOON, PRIOR_LAKE.lat, PRIOR_LAKE.lon, PRIOR_LAKE.tz);
    expect(sun.sunrise).not.toBeNull();
    expect(sun.sunset).not.toBeNull();
    expect(sun.sunriseHour).toBeGreaterThan(7);
    expect(sun.sunriseHour).toBeLessThan(8);
    expect(sun.sunsetHour).toBeGreaterThan(18);
    expect(sun.sunsetHour).toBeLessThan(19);
    expect(sun.isNight).toBe(false);
    // About eleven hours of daylight in mid October.
    expect(sun.dayLengthMs / 3600_000).toBeGreaterThan(10.5);
    expect(sun.dayLengthMs / 3600_000).toBeLessThan(11.5);
  });

  it('is night after sunset', () => {
    const sun = sunTimesFor(new Date('2026-10-16T03:00:00Z'), PRIOR_LAKE.lat, PRIOR_LAKE.lon, PRIOR_LAKE.tz); // 22:00 CDT
    expect(sun.isNight).toBe(true);
  });

  it('treats polar night as night all day, with no sunrise to mark', () => {
    // Longyearbyen in December: the sun never rises.
    const sun = sunTimesFor(new Date('2026-12-15T12:00:00Z'), 78.22, 15.63, 'Arctic/Longyearbyen');
    expect(sun.sunrise).toBeNull();
    expect(sun.sunset).toBeNull();
    expect(sun.isNight).toBe(true);
    expect(sun.dayLengthMs).toBe(0);
    expect(isNightHour(12, sun)).toBe(true);
  });

  it('treats polar day as day all day', () => {
    const sun = sunTimesFor(new Date('2026-06-21T12:00:00Z'), 78.22, 15.63, 'Arctic/Longyearbyen');
    expect(sun.sunrise).toBeNull();
    expect(sun.isNight).toBe(false);
    expect(isNightHour(2, sun)).toBe(false);
  });

  it('has no daylight model without coordinates', () => {
    expect(sunTimesFor(OCT_AFTERNOON)).toBe(ALWAYS_DAY);
    expect(isNightHour(23, ALWAYS_DAY)).toBe(false);
  });
});

describe('isNightHour', () => {
  const sun = { ...ALWAYS_DAY, sunrise: new Date(), sunset: new Date(), sunriseHour: 7.4, sunsetHour: 18.4 };
  it('shades the hours outside the window', () => {
    expect(isNightHour(3, sun)).toBe(true);
    expect(isNightHour(7, sun)).toBe(true);
    expect(isNightHour(8, sun)).toBe(false);
    expect(isNightHour(18, sun)).toBe(false);
    expect(isNightHour(19, sun)).toBe(true);
  });
});
