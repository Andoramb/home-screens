// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import WeatherStatsView from '../WeatherStatsView';
import { hourlyRun, renderView, stubBox, viewProps } from './view-test-helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T19:10:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WeatherStatsView', () => {
  it('draws every readout the provider gives, plus the sun times from the coordinates', () => {
    stubBox(640, 360);
    const { container } = renderView(<WeatherStatsView {...viewProps()} />);
    expect(container.querySelector('[data-weather-stats-mode]')?.getAttribute('data-weather-stats-mode')).toBe('grid');
    for (const key of ['wind', 'humidity', 'uv', 'pressure', 'sunrise', 'sunset']) {
      expect(screen.getByTestId(`weather-stat-${key}`)).toBeTruthy();
    }
    expect(screen.getByText('Right now')).toBeTruthy();
    expect(screen.getByText('Dew point 41°')).toBeTruthy();
    expect(screen.getByText('Moderate, hat and sunglasses')).toBeTruthy();
    // Imperial pressure reads in inches of mercury.
    expect(screen.getByText('30.12')).toBeTruthy();
    expect(screen.getByText(/7:3\d AM/)).toBeTruthy();
    expect(screen.getByText(/6:3\d PM/)).toBeTruthy();
  });

  it('drops the cells the provider does not fill', () => {
    stubBox(640, 360);
    const hourly = hourlyRun().map((h) => ({ ...h, uvIndex: undefined, pressure: undefined, humidity: undefined }));
    renderView(<WeatherStatsView {...viewProps({ hourly })} />);
    expect(screen.getByTestId('weather-stat-wind')).toBeTruthy();
    expect(screen.queryByTestId('weather-stat-uv')).toBeNull();
    expect(screen.queryByTestId('weather-stat-pressure')).toBeNull();
    expect(screen.queryByTestId('weather-stat-humidity')).toBeNull();
  });

  it('runs as one row in a wide shallow box and as a list in a narrow one', () => {
    stubBox(1000, 150);
    const wide = renderView(<WeatherStatsView {...viewProps()} />);
    expect(wide.container.querySelector('[data-weather-stats-mode]')?.getAttribute('data-weather-stats-mode')).toBe('row');
    cleanup();
    stubBox(200, 360);
    const narrow = renderView(<WeatherStatsView {...viewProps()} />);
    expect(narrow.container.querySelector('[data-weather-stats-mode]')?.getAttribute('data-weather-stats-mode')).toBe('list');
  });

  it('shows the empty state with nothing to read out', () => {
    stubBox(640, 360);
    renderView(<WeatherStatsView {...viewProps({ hourly: [], latitude: undefined, longitude: undefined })} />);
    expect(screen.getByText('No weather data')).toBeTruthy();
  });
});
