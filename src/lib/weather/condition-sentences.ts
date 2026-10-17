/**
 * The one-line readings under the Conditions and Forecast views' instrument cards, as pure
 * rules that return translation keys and their variables. The view turns
 * them into words; nothing here knows about React or a locale.
 */
import type { ForecastDay, HourlyWeather } from './types';

export interface Sentence {
  key: string;
  vars?: Record<string, string | number>;
}

export { compassLabel } from './units';

/** "Similar to the actual temperature", or why it feels warmer or colder. */
export function feelsLikeSentence(temp: number, feelsLike: number, units: 'metric' | 'imperial'): Sentence {
  const diff = feelsLike - temp;
  const threshold = units === 'metric' ? 2 : 3;
  if (Math.abs(diff) < threshold) return { key: 'feelsSimilar' };
  return { key: diff > 0 ? 'feelsWarmer' : 'feelsColder' };
}

/** The dew point when the source sends one, else a word for the humidity. */
export function humiditySentence(humidity: number, dewPoint: number | undefined): Sentence {
  if (dewPoint != null) return { key: 'dewPointNow', vars: { temp: Math.round(dewPoint) } };
  if (humidity < 30) return { key: 'humidityDry' };
  if (humidity <= 60) return { key: 'humidityComfortable' };
  if (humidity <= 80) return { key: 'humidityHumid' };
  return { key: 'humidityVeryHumid' };
}

/** How far one can see, in words. `visibility` is in km (metric) or miles (imperial). */
export function visibilitySentence(visibility: number, units: 'metric' | 'imperial'): Sentence {
  const km = units === 'metric' ? visibility : visibility * 1.609;
  if (km >= 16) return { key: 'visibilityPerfect' };
  if (km >= 8) return { key: 'visibilityClear' };
  if (km >= 3) return { key: 'visibilityReduced' };
  return { key: 'visibilityPoor' };
}

/** A precipitation amount in the household's unit: "0.1 in" or "3 mm". */
export function formatPrecipAmount(amount: number, units: 'metric' | 'imperial'): string {
  if (units === 'metric') return `${amount < 1 && amount > 0 ? amount.toFixed(1) : Math.round(amount)} mm`;
  if (amount === 0) return '0 in';
  return `${amount < 1 ? amount.toFixed(2).replace(/0$/, '') : amount.toFixed(1)} in`;
}

/** The smallest daily amount worth calling rain. */
const WET_DAY = { metric: 0.5, imperial: 0.02 } as const;

/**
 * Today's total and the next day with rain in it. `null` when the source
 * sends no daily amounts at all, so the card can hide.
 */
export function precipitationReading(forecast: ForecastDay[], units: 'metric' | 'imperial'): { today: number; next: Sentence } | null {
  if (!forecast.some((d) => d.precipAmount != null)) return null;
  const today = forecast[0]?.precipAmount ?? 0;
  const later = forecast.slice(1);
  const wet = later.find((d) => (d.precipAmount ?? 0) >= WET_DAY[units]);
  if (wet) return { today, next: { key: 'precipNext', vars: { amount: formatPrecipAmount(wet.precipAmount!, units), date: wet.date } } };
  return { today, next: { key: 'precipNone', vars: { days: forecast.length } } };
}

/** Air quality on the OpenWeatherMap 1 (good) to 5 (very poor) scale. */
export const AQI_LEVELS = ['good', 'fair', 'moderate', 'poor', 'veryPoor'] as const;
export type AqiLevel = (typeof AQI_LEVELS)[number];

export function airQualityLevel(aqi: number): AqiLevel {
  return AQI_LEVELS[Math.min(5, Math.max(1, Math.round(aqi))) - 1];
}

/** Where the level sits on the card's gradient bar, 0 to 100. */
export function airQualityPosition(aqi: number): number {
  return ((Math.min(5, Math.max(1, aqi)) - 1) / 4) * 85 + 7;
}

/** The UV band and the word for it. */
export function uvLevel(uv: number): 'low' | 'moderate' | 'high' | 'veryHigh' {
  return uv >= 8 ? 'veryHigh' : uv >= 6 ? 'high' : uv >= 3 ? 'moderate' : 'low';
}

/** The highest UV still to come today, for "Low for the rest of the day". */
export function uvRestOfDay(hourly: HourlyWeather[], sunsetMs: number | null): number | null {
  const end = sunsetMs ?? Number.POSITIVE_INFINITY;
  let max: number | null = null;
  for (const h of hourly) {
    if (new Date(h.time).getTime() > end) break;
    if (h.uvIndex != null) max = Math.max(max ?? 0, h.uvIndex);
  }
  return max;
}

/**
 * Pressure trend from the next hours of forecast pressure, where the source
 * sends it hourly. Rising or falling means more than about 1 hPa over the
 * window, the same rule the Almanac applies.
 */
export function pressureTrend(hourly: HourlyWeather[], hours = 6): 'rising' | 'falling' | 'steady' {
  const series = hourly.slice(0, hours).map((h) => h.pressure).filter((v): v is number => v != null);
  if (series.length < 2) return 'steady';
  const delta = series[series.length - 1] - series[0];
  return delta > 1 ? 'rising' : delta < -1 ? 'falling' : 'steady';
}

/**
 * Where a pressure sits between a low and a high reading, 0 to 1, for the
 * gauge needle. 980 to 1050 hPa covers everything but a hurricane.
 */
export function pressurePosition(hPa: number): number {
  return Math.max(0, Math.min(1, (hPa - 980) / 70));
}
