import type { MinutelyPrecip } from './types';

/**
 * Whether a minute of the next hour counts as precipitation, and what the
 * hour adds up to. The Weather module's Precipitation view and the
 * full-screen weather's nowcast both read this, for their summaries and
 * their bars alike, so a wall never says "dry" in one place and "stopping in
 * 13 min" in another, and no bar stands where its summary says it is dry.
 */

/**
 * A minute counts once its rate is past light drizzle: over 0.02 in/h, or
 * the same rate in mm/h for metric. Pirate Weather, like Dark Sky before it,
 * reports a small nonzero intensity for most clear minutes (anywhere from
 * 0.0002 to 0.02 in/h on a clear day), none of it rain anyone would notice.
 * Intensity is in/h for imperial and mm/h for metric.
 */
const WET_INTENSITY = { imperial: 0.02, metric: 0.5 } as const;

/** A minute this unlikely (percent) is dry whatever its rate. */
const MIN_PROBABILITY = 20;

/**
 * Rain rate that fills a bar. Pirate Weather (the only minutely source)
 * reports `precipIntensity` in inches/hour for imperial and mm/hour for
 * metric (`units=ca`), and 0.4 in/h is roughly 10 mm/h: a hard downpour.
 * A single threshold in one unit made every metric drizzle read as a storm.
 */
export const FULL_BAR_INTENSITY = { imperial: 0.4, metric: 10 } as const;

export function isPrecipitating(minute: MinutelyPrecip, units: 'metric' | 'imperial'): boolean {
  if (!(minute.intensity > WET_INTENSITY[units])) return false;
  return minute.probability === undefined || minute.probability >= MIN_PROBABILITY;
}

/** What the next hour holds: `minutes` is how long until it starts or stops. */
export type PrecipitationOutlook =
  | { kind: 'dry' }
  | { kind: 'continuing' }
  | { kind: 'stopping'; minutes: number }
  | { kind: 'starting'; minutes: number };

export function precipitationOutlook(minutes: MinutelyPrecip[], units: 'metric' | 'imperial'): PrecipitationOutlook {
  const wet = minutes.map((m) => isPrecipitating(m, units));
  if (wet[0]) {
    const stopsAt = wet.indexOf(false);
    return stopsAt === -1 ? { kind: 'continuing' } : { kind: 'stopping', minutes: stopsAt };
  }
  const startsAt = wet.indexOf(true);
  return startsAt === -1 ? { kind: 'dry' } : { kind: 'starting', minutes: startsAt };
}
