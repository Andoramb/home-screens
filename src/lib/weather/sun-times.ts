/**
 * Today's daylight window for a place: what the weather views shade as night,
 * where the sunrise and sunset marks go on an hour axis, and how long the day
 * is. One rule for the full-screen weather module (sky layer, ribbon, Almanac
 * sun card) and the regular weather module's ribbon, hour-by-hour and sun
 * views, so the two never disagree about when night starts.
 */
import SunCalc from 'suncalc';
import { hoursInTZ } from '@/lib/sun-astro';

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  /** Fractional hours in the display timezone, for placing markers on a 24h axis. */
  sunriseHour: number;
  sunsetHour: number;
  isNight: boolean;
  dayLengthMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** No coordinates: no daylight model, so everything counts as day. */
export const ALWAYS_DAY: SunTimes = { sunrise: null, sunset: null, sunriseHour: 0, sunsetHour: 24, isNight: false, dayLengthMs: 0 };

/**
 * Whether a wall-clock hour falls outside today's daylight window.
 *
 * `sunrise` / `sunset` are null when the sun never crosses the horizon today
 * (polar day or night) or when there are no coordinates. In that case
 * `isNight` is constant for the whole day and this returns it for every hour,
 * rather than pretending there was a sunrise at midnight. The ribbon applies
 * today's window to every hour it draws, which is a fair approximation over
 * 48 hours and avoids a SunCalc call per point.
 */
export function isNightHour(hour: number, sun: SunTimes): boolean {
  if (!sun.sunrise || !sun.sunset) return sun.isNight;
  const { sunriseHour, sunsetHour } = sun;
  if (sunriseHour === sunsetHour) return sun.isNight;
  return sunriseHour < sunsetHour
    ? hour < sunriseHour || hour >= sunsetHour
    : hour < sunriseHour && hour >= sunsetHour;
}

/**
 * The daylight window on the day `now` falls in, at the given coordinates.
 * `now` is the real instant (SunCalc takes true UTC instants); `timezone` is
 * only used to place the hours on the display's clock.
 */
export function sunTimesFor(now: Date, latitude?: number, longitude?: number, timezone?: string): SunTimes {
  if (latitude == null || longitude == null) return ALWAYS_DAY;
  const times = SunCalc.getTimes(now, latitude, longitude);
  const valid = (d: Date | undefined) => (d && !Number.isNaN(d.getTime()) ? d : null);
  const sunrise = valid(times.sunrise);
  const sunset = valid(times.sunset);
  if (!sunrise || !sunset) {
    // Polar day or night: the sun never crosses the horizon today, so its
    // altitude right now settles which one, for the whole day.
    const up = SunCalc.getPosition(now, latitude, longitude).altitude > 0;
    return { sunrise: null, sunset: null, sunriseHour: 0, sunsetHour: 24, isNight: !up, dayLengthMs: up ? DAY_MS : 0 };
  }
  const window: SunTimes = {
    sunrise, sunset,
    sunriseHour: hoursInTZ(sunrise, timezone),
    sunsetHour: hoursInTZ(sunset, timezone),
    isNight: false,
    dayLengthMs: Math.max(0, sunset.getTime() - sunrise.getTime()),
  };
  return { ...window, isNight: isNightHour(hoursInTZ(now, timezone), window) };
}
