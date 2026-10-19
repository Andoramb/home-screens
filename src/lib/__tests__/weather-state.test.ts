import { describe, it, expect } from 'vitest';
import {
  WEATHER_ALERT_PROVIDERS,
  WEATHER_STATE_KEYS,
  WEATHER_STATE_KEY_LIST,
  deriveWeatherState,
  providerSendsWeatherAlerts,
  weatherProvidedStateKeys,
} from '../weather-state';
import type { ForecastDay, HourlyWeather, WeatherAlert } from '@/lib/weather/types';

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
    // `alert_active` is the one definite value: no data means no warning.
    const blank = Object.fromEntries(WEATHER_STATE_KEY_LIST.map((k) => [k, k === K.alertActive ? 'false' : '']));
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

describe('deriveWeatherState alerts', () => {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const alert = (over: Partial<WeatherAlert> = {}): WeatherAlert => ({
    title: 'Wind Advisory',
    severity: 'Moderate',
    description: '',
    expires: nowSeconds + 3600,
    ...over,
  });

  it('reports no warning as false, not blank, so "no warning" conditions hold on every provider', () => {
    const none = deriveWeatherState({ hourly: [hour(0)] }, now);
    expect(none[K.alertActive]).toBe('false');
    expect(none[K.alertSeverity]).toBe('');
    expect(none[K.alertTitle]).toBe('');
    expect(deriveWeatherState({ hourly: [hour(0)], alerts: [] }, now)[K.alertActive]).toBe('false');
  });

  it('publishes the most serious warning still in force', () => {
    const values = deriveWeatherState({
      alerts: [alert(), alert({ title: 'Winter Storm Warning', severity: 'Severe' }), alert({ severity: 'Unknown', title: 'Fog' })],
    }, now);
    expect(values[K.alertActive]).toBe('true');
    expect(values[K.alertSeverity]).toBe('severe');
    expect(values[K.alertTitle]).toBe('Winter Storm Warning');
  });

  it('drops expired warnings, reading expiry in seconds like the providers send it', () => {
    const values = deriveWeatherState({ alerts: [alert({ expires: nowSeconds - 60 })] }, now);
    expect(values[K.alertActive]).toBe('false');
    // A millisecond stamp is honoured too.
    const ms = deriveWeatherState({ alerts: [alert({ expires: now.getTime() + 60_000 })] }, now);
    expect(ms[K.alertActive]).toBe('true');
  });

  it('counts a warning with no expiry as active', () => {
    const values = deriveWeatherState({ alerts: [alert({ expires: 0 })] }, now);
    expect(values[K.alertActive]).toBe('true');
    expect(values[K.alertSeverity]).toBe('moderate');
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

  it('leaves the warning keys out when asked, keeping the chance keys in order', () => {
    const rows = weatherProvidedStateKeys((key) => `t:${key}`, { alerts: false });
    expect(rows.map((r) => r.key)).toEqual([
      K.condition, K.temperature, K.precipChanceNow, K.precipChanceNextHours, K.precipChanceToday,
    ]);
  });
});

describe('WEATHER_ALERT_PROVIDERS', () => {
  it('names exactly the providers that implement getAlerts', async () => {
    // The list gates the editor's warning keys; a provider that gains
    // warnings must be added here, and one that loses them removed.
    const providers: Record<string, { prototype: object }> = {
      openweathermap: (await import('@/lib/weather/openweathermap')).OpenWeatherMapProvider,
      weatherapi: (await import('@/lib/weather/weatherapi')).WeatherAPIProvider,
      pirateweather: (await import('@/lib/weather/pirateweather')).PirateWeatherProvider,
      noaa: (await import('@/lib/weather/noaa')).NOAAProvider,
      'open-meteo': (await import('@/lib/weather/open-meteo')).OpenMeteoProvider,
      yr: (await import('@/lib/weather/yr')).YrProvider,
      smhi: (await import('@/lib/weather/smhi')).SMHIProvider,
      metoffice: (await import('@/lib/weather/metoffice')).MetOfficeProvider,
      envcanada: (await import('@/lib/weather/envcanada')).EnvCanadaProvider,
    };
    const withAlerts = Object.entries(providers)
      .filter(([, cls]) => typeof (cls.prototype as { getAlerts?: unknown }).getAlerts === 'function')
      .map(([id]) => id)
      .sort();
    expect(withAlerts).toEqual([...WEATHER_ALERT_PROVIDERS].sort());
    expect(providerSendsWeatherAlerts('noaa')).toBe(true);
    expect(providerSendsWeatherAlerts('open-meteo')).toBe(false);
    expect(providerSendsWeatherAlerts('global')).toBe(false);
    expect(providerSendsWeatherAlerts(undefined)).toBe(false);
  });
});
