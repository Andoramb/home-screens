import { describe, it, expect } from 'vitest';
import {
  WEATHER_STATE_KEYS,
  WEATHER_STATE_KEY_LIST,
  deriveWeatherState,
  weatherProvidedStateKeys,
} from '../weather-state';
import type { ForecastDay, HourlyWeather } from '@/lib/weather/types';

const K = WEATHER_STATE_KEYS;

// "Now": 2026-08-20 20:30 UTC, which is 22:30 in Berlin and 15:30 in Chicago.
const now = new Date('2026-08-20T20:30:00Z');

function hour(offsetHours: number, over: Partial<HourlyWeather> = {}): HourlyWeather {
  return {
    time: new Date(now.getTime() + offsetHours * 3_600_000).toISOString(),
    temp: 70,
    icon: 'clear-day',
    description: 'Clear',
    ...over,
  };
}

function day(date: string, over: Partial<ForecastDay> = {}): ForecastDay {
  return { date, high: 80, low: 60, icon: 'clear-day', description: 'Sunny', ...over };
}

describe('deriveWeatherState', () => {
  it('publishes every key blank when there is nothing to read', () => {
    // Blank, never absent: the rule engine's cold-start guard would swallow
    // the first edge after a key vanished (see the lifecycle note).
    const blank = Object.fromEntries(WEATHER_STATE_KEY_LIST.map((k) => [k, '']));
    expect(deriveWeatherState(null, now)).toEqual(blank);
    expect(deriveWeatherState({}, now)).toEqual(blank);
    expect(deriveWeatherState({ hourly: [], forecast: [] }, now)).toEqual(blank);
  });

  it('covers every advertised key on a populated payload', () => {
    const values = deriveWeatherState({ hourly: [hour(0)], forecast: [day('2026-08-20')] }, now);
    expect(Object.keys(values).sort()).toEqual([...WEATHER_STATE_KEY_LIST].sort());
  });

  it('reads the current condition and temperature from the first hourly row', () => {
    const values = deriveWeatherState({
      hourly: [hour(0, { description: 'Heavy thunderstorm', temp: 71.6, precipProbability: 85 })],
    }, now);
    expect(values[K.condition]).toBe('thunderstorm');
    expect(values[K.temperature]).toBe('72');
    expect(values[K.precipChanceNow]).toBe('85');
  });

  it('leaves the chance keys blank when the provider sends no probability', () => {
    const values = deriveWeatherState({ hourly: [hour(0), hour(1), hour(2)] }, now);
    expect(values[K.condition]).toBe('clear');
    expect(values[K.precipChanceNow]).toBe('');
    expect(values[K.precipChanceNextHours]).toBe('');
    expect(values[K.precipChanceToday]).toBe('');
  });

  it('takes the highest chance inside the next six hours and ignores rows beyond it', () => {
    const values = deriveWeatherState({
      hourly: [
        hour(0, { precipProbability: 10 }),
        hour(2, { precipProbability: 40 }),
        hour(5, { precipProbability: 65 }),
        hour(7, { precipProbability: 95 }),
      ],
    }, now);
    expect(values[K.precipChanceNextHours]).toBe('65');
  });

  it('counts the row that describes the present even though its stamp is in the past', () => {
    // OpenWeatherMap stamps three-hour slots: at 20:30 the current row reads 18:00.
    const values = deriveWeatherState({
      hourly: [hour(-2.5, { precipProbability: 70 }), hour(0.5, { precipProbability: 20 })],
    }, now);
    expect(values[K.precipChanceNextHours]).toBe('70');
    expect(values[K.precipChanceToday]).toBe('70');
  });

  it('drops rows well in the past', () => {
    const values = deriveWeatherState({
      hourly: [hour(-6, { precipProbability: 90 }), hour(0, { precipProbability: 5 })],
    }, now);
    expect(values[K.precipChanceNextHours]).toBe('5');
    expect(values[K.precipChanceToday]).toBe('5');
  });

  it('buckets "today" on the display zone, not the hub clock', () => {
    // 20:30 UTC. The row three hours out is 23:30 UTC: still today in UTC,
    // already tomorrow (01:30) in Berlin, this afternoon (18:30) in Chicago.
    const payload = { hourly: [hour(0, { precipProbability: 5 }), hour(3, { precipProbability: 80 })] };
    expect(deriveWeatherState(payload, now, { timezone: 'UTC' })[K.precipChanceToday]).toBe('80');
    expect(deriveWeatherState(payload, now, { timezone: 'Europe/Berlin' })[K.precipChanceToday]).toBe('5');
    expect(deriveWeatherState(payload, now, { timezone: 'America/Chicago' })[K.precipChanceToday]).toBe('80');
    // The rolling window does not care about days.
    expect(deriveWeatherState(payload, now, { timezone: 'Europe/Berlin' })[K.precipChanceNextHours]).toBe('80');
  });

  it("folds in the forecast's first row only when it is today's", () => {
    const hourly = [hour(0, { precipProbability: 10 })];
    const today = deriveWeatherState({ hourly, forecast: [day('2026-08-20', { precipProbability: 60 })] }, now, { timezone: 'UTC' });
    expect(today[K.precipChanceToday]).toBe('60');
    // Late in the evening some providers have moved on to tomorrow.
    const tomorrow = deriveWeatherState({ hourly, forecast: [day('2026-08-21', { precipProbability: 60 })] }, now, { timezone: 'UTC' });
    expect(tomorrow[K.precipChanceToday]).toBe('10');
    // In Berlin it is already the 20th's late evening; the forecast row dated
    // the 20th in the display zone still counts.
    const berlin = deriveWeatherState({ hourly, forecast: [day('2026-08-20', { precipProbability: 60 })] }, now, { timezone: 'Europe/Berlin' });
    expect(berlin[K.precipChanceToday]).toBe('60');
  });

  it('rounds fractional percentages and ignores rows with unreadable times', () => {
    const values = deriveWeatherState({
      hourly: [hour(0, { precipProbability: 33.4 }), { ...hour(1, { precipProbability: 99 }), time: 'not a time' }],
    }, now);
    expect(values[K.precipChanceNow]).toBe('33');
    expect(values[K.precipChanceNextHours]).toBe('33');
  });
});

describe('weatherProvidedStateKeys', () => {
  it('offers every key, in the published order, with translated labels', () => {
    const rows = weatherProvidedStateKeys((key) => `t:${key}`);
    expect(rows.map((r) => r.key)).toEqual(WEATHER_STATE_KEY_LIST);
    for (const row of rows) {
      expect(row.label).toMatch(/^t:stateKeys\.weather\./);
      expect(row.sampleValues?.length).toBeGreaterThan(0);
    }
  });
});
