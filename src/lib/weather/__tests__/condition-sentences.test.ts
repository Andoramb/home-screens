import { describe, it, expect } from 'vitest';
import {
  compassLabel, feelsLikeSentence, humiditySentence, visibilitySentence, formatPrecipAmount,
  precipitationReading, airQualityLevel, airQualityPosition, uvLevel, uvRestOfDay, pressureTrend, pressurePosition,
} from '../condition-sentences';
import type { ForecastDay, HourlyWeather } from '../types';

const hour = (i: number, extra: Partial<HourlyWeather> = {}): HourlyWeather => ({
  time: new Date(Date.UTC(2026, 9, 16, 12 + i)).toISOString(), temp: 60, icon: 'sun', description: 'Clear', ...extra,
});
const day = (i: number, precipAmount?: number): ForecastDay => ({
  date: `2026-10-${String(16 + i).padStart(2, '0')}`, high: 70, low: 50, icon: 'sun', description: 'Sunny', precipAmount,
});

describe('compassLabel', () => {
  it('names the sixteen points and wraps', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(22.5)).toBe('NNE');
    expect(compassLabel(90)).toBe('E');
    expect(compassLabel(270)).toBe('W');
    expect(compassLabel(359)).toBe('N');
    expect(compassLabel(-90)).toBe('W');
  });
});

describe('feelsLikeSentence', () => {
  it('calls a small difference similar, in either unit', () => {
    expect(feelsLikeSentence(61, 62, 'imperial').key).toBe('feelsSimilar');
    expect(feelsLikeSentence(16, 17, 'metric').key).toBe('feelsSimilar');
  });
  it('says warmer or colder past the threshold', () => {
    expect(feelsLikeSentence(80, 88, 'imperial').key).toBe('feelsWarmer');
    expect(feelsLikeSentence(30, 20, 'imperial').key).toBe('feelsColder');
    expect(feelsLikeSentence(5, 1, 'metric').key).toBe('feelsColder');
  });
});

describe('humiditySentence', () => {
  it('prefers the dew point', () => {
    expect(humiditySentence(38, 35.6)).toEqual({ key: 'dewPointNow', vars: { temp: 36 } });
  });
  it('falls back to a word for the humidity', () => {
    expect(humiditySentence(20, undefined).key).toBe('humidityDry');
    expect(humiditySentence(50, undefined).key).toBe('humidityComfortable');
    expect(humiditySentence(70, undefined).key).toBe('humidityHumid');
    expect(humiditySentence(90, undefined).key).toBe('humidityVeryHumid');
  });
});

describe('visibilitySentence', () => {
  it('reads miles and kilometres on one scale', () => {
    expect(visibilitySentence(10, 'imperial').key).toBe('visibilityPerfect');
    expect(visibilitySentence(16, 'metric').key).toBe('visibilityPerfect');
    expect(visibilitySentence(6, 'imperial').key).toBe('visibilityClear');
    expect(visibilitySentence(4, 'metric').key).toBe('visibilityReduced');
    expect(visibilitySentence(0.5, 'imperial').key).toBe('visibilityPoor');
  });
});

describe('formatPrecipAmount', () => {
  it('formats inches to a useful precision and millimetres whole', () => {
    expect(formatPrecipAmount(0, 'imperial')).toBe('0 in');
    expect(formatPrecipAmount(0.1, 'imperial')).toBe('0.1 in');
    expect(formatPrecipAmount(0.25, 'imperial')).toBe('0.25 in');
    expect(formatPrecipAmount(1.5, 'imperial')).toBe('1.5 in');
    expect(formatPrecipAmount(3.4, 'metric')).toBe('3 mm');
    expect(formatPrecipAmount(0.4, 'metric')).toBe('0.4 mm');
    expect(formatPrecipAmount(0, 'metric')).toBe('0 mm');
  });
});

describe('precipitationReading', () => {
  it('hides when the source sends no amounts', () => {
    expect(precipitationReading([day(0), day(1)], 'imperial')).toBeNull();
  });
  it('finds the next wet day past today', () => {
    const r = precipitationReading([day(0, 0), day(1, 0.01), day(2, 0.1), day(3, 0.5)], 'imperial');
    expect(r?.today).toBe(0);
    expect(r?.next).toEqual({ key: 'precipNext', vars: { amount: '0.1 in', date: '2026-10-18' } });
  });
  it('says none expected over the forecast span', () => {
    const r = precipitationReading([day(0, 0.3), day(1, 0), day(2, 0)], 'metric');
    expect(r?.today).toBe(0.3);
    expect(r?.next).toEqual({ key: 'precipNone', vars: { days: 3 } });
  });
});

describe('air quality', () => {
  it('maps the five levels and clamps', () => {
    expect(airQualityLevel(1)).toBe('good');
    expect(airQualityLevel(2)).toBe('fair');
    expect(airQualityLevel(5)).toBe('veryPoor');
    expect(airQualityLevel(9)).toBe('veryPoor');
    expect(airQualityLevel(0)).toBe('good');
  });
  it('spreads the levels across the bar', () => {
    expect(airQualityPosition(1)).toBe(7);
    expect(airQualityPosition(5)).toBe(92);
  });
});

describe('uv', () => {
  it('bands the index', () => {
    expect(uvLevel(0)).toBe('low');
    expect(uvLevel(3)).toBe('moderate');
    expect(uvLevel(6)).toBe('high');
    expect(uvLevel(11)).toBe('veryHigh');
  });
  it('finds the highest index left before sunset', () => {
    const hrs = [hour(0, { uvIndex: 2 }), hour(1, { uvIndex: 4 }), hour(2, { uvIndex: 1 }), hour(3, { uvIndex: 9 })];
    const sunset = new Date(hrs[2].time).getTime();
    expect(uvRestOfDay(hrs, sunset)).toBe(4);
    expect(uvRestOfDay(hrs, null)).toBe(9);
    expect(uvRestOfDay([hour(0)], null)).toBeNull();
  });
});

describe('pressure', () => {
  it('reads the trend from the next hours', () => {
    expect(pressureTrend([hour(0, { pressure: 1010 }), hour(1, { pressure: 1011 }), hour(2, { pressure: 1013 })])).toBe('rising');
    expect(pressureTrend([hour(0, { pressure: 1010 }), hour(1, { pressure: 1008 })])).toBe('falling');
    expect(pressureTrend([hour(0, { pressure: 1010 }), hour(1, { pressure: 1010.5 })])).toBe('steady');
    expect(pressureTrend([hour(0, { pressure: 1010 })])).toBe('steady');
  });
  it('places the needle between 980 and 1050 hPa', () => {
    expect(pressurePosition(980)).toBe(0);
    expect(pressurePosition(1015)).toBeCloseTo(0.5);
    expect(pressurePosition(1100)).toBe(1);
  });
});
