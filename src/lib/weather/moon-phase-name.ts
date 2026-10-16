/**
 * The name of the moon's phase, as a translation key under
 * `fullscreen-weather.moon`, from SunCalc's 0..1 phase fraction. Shared by
 * the full-screen Almanac and the regular weather module's sun view.
 */
export type MoonPhaseKey = 'new' | 'waxingCrescent' | 'firstQuarter' | 'waxingGibbous' | 'full' | 'waningGibbous' | 'lastQuarter' | 'waningCrescent';

export function moonPhaseKey(phase: number): MoonPhaseKey {
  if (phase < 0.03 || phase > 0.97) return 'new';
  if (phase < 0.22) return 'waxingCrescent';
  if (phase < 0.28) return 'firstQuarter';
  if (phase < 0.47) return 'waxingGibbous';
  if (phase < 0.53) return 'full';
  if (phase < 0.72) return 'waningGibbous';
  if (phase < 0.78) return 'lastQuarter';
  return 'waningCrescent';
}

/** One lunation, new moon to new moon, in days. */
const SYNODIC_MONTH_DAYS = 29.530588;

/**
 * Whole days until the next full moon from SunCalc's 0..1 phase, where 0.5
 * is full. Just past full it answers a whole month ahead; the caller hides
 * the caption on the full day itself.
 */
export function daysToFullMoon(phase: number): number {
  const ahead = (0.5 - phase + 1) % 1;
  return Math.round(ahead * SYNODIC_MONTH_DAYS);
}
