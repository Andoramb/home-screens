// Shared scaffolding for the chart-view tests: a measured box (jsdom has no
// layout, so the views would otherwise see a 0x0 box and pick their portrait
// mode), the i18n provider, and a forecast run across a night.
import { render } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSCore from '@/translations/en-US/core.json';
import enUSModules from '@/translations/en-US/modules.json';
import enUSWeather from '@/translations/en-US/weather.json';
import type { ForecastDay, HourlyWeather } from '@/lib/weather';
import type { WeatherConfig } from '@/types/config';
import type { WeatherViewProps } from '../types';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

/** Make every element report this box, so the views lay out for that shape. */
export function stubBox(width: number, height: number) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height });
}

export const PRIOR_LAKE = { latitude: 44.7133, longitude: -93.4227, timezone: 'America/Chicago' };

/** 24 hours from 2 PM on 2026-10-15 Chicago time, across a night. */
export function hourlyRun(count = 24): HourlyWeather[] {
  const temps = [54, 56, 57, 58, 57, 54, 50, 47, 45, 44, 43, 42, 41, 41, 42, 44, 47, 50, 53, 56, 58, 60, 61, 61, 60, 58, 55, 51, 48, 46, 45, 44, 44, 43, 43, 44, 46, 48, 50, 52, 54, 55, 55, 54, 52, 49, 47, 45];
  const start = Date.parse('2026-10-15T19:00:00Z');
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(start + i * 3600_000).toISOString(),
    temp: temps[i % temps.length],
    icon: i < 5 ? 'partly-cloudy-day' : 'clear-night',
    description: 'Partly cloudy',
    precipProbability: i < 3 ? 10 : 0,
    windSpeed: 9,
    humidity: 62,
    uvIndex: 3,
    pressure: 1020 + i * 0.2,
    dewPoint: 41,
  }));
}

export const WEEK: ForecastDay[] = [
  { date: '2026-10-15', high: 58, low: 41, icon: 'partly-cloudy-day', description: 'Partly cloudy', precipProbability: 10, windSpeed: 9 },
  { date: '2026-10-16', high: 61, low: 44, icon: 'clear-day', description: 'Sunny', precipProbability: 0, windSpeed: 7 },
  { date: '2026-10-17', high: 55, low: 39, icon: 'rain', description: 'Showers', precipProbability: 70, windSpeed: 14 },
  { date: '2026-10-18', high: 49, low: 34, icon: 'cloudy', description: 'Cloudy', precipProbability: 30, windSpeed: 12 },
  { date: '2026-10-19', high: 52, low: 33, icon: 'clear-day', description: 'Sunny', precipProbability: 5, windSpeed: 6 },
];

export function viewProps(overrides: Partial<WeatherViewProps> = {}, config: Partial<WeatherConfig> = {}): WeatherViewProps {
  return {
    config: {
      view: 'week', iconSet: 'outline', provider: 'global', hoursToShow: 8, daysToShow: 5,
      showFeelsLike: true, showHighLow: true, showPrecipitation: true, showPrecipAmount: false,
      showHumidity: false, showWind: true, showPressure: false, showVisibility: false, showDewPoint: false,
      hideWhenNoAlerts: false, showLocation: false, showTitle: true,
      ...config,
    } as WeatherConfig,
    hourly: hourlyRun(),
    forecast: WEEK,
    units: 'imperial',
    timeFormat: '12h',
    scaledFontSize: 16,
    ...PRIOR_LAKE,
    ...overrides,
  };
}

export function renderView(node: React.ReactElement) {
  return render(
    <I18nProvider locale="en-US" blob={{ core: enUSCore, modules: enUSModules, weather: enUSWeather }}>
      {node}
    </I18nProvider>,
  );
}
