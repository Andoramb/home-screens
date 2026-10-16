// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import WeatherWeekView from '../WeatherWeekView';
import { WEEK, renderView, stubBox, viewProps } from './view-test-helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T19:10:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WeatherWeekView', () => {
  it('stands the days up as columns in a wide box and rings today at the live temperature', () => {
    stubBox(640, 360);
    const { container } = renderView(<WeatherWeekView {...viewProps()} />);
    expect(container.querySelector('[data-weather-week-mode]')?.getAttribute('data-weather-week-mode')).toBe('columns');
    expect(container.querySelectorAll('[data-weather-day]')).toHaveLength(5);
    expect(screen.getAllByTestId('weather-now-ring')).toHaveLength(1);
    // The heading names the count and the week's shared scale.
    expect(screen.getByText('5-day outlook')).toBeTruthy();
    expect(screen.getByText('33° – 61°')).toBeTruthy();
  });

  it('lays the days down as bands in a tall box, with the date under the name', () => {
    stubBox(420, 600);
    const { container } = renderView(<WeatherWeekView {...viewProps()} />);
    expect(container.querySelector('[data-weather-week-mode]')?.getAttribute('data-weather-week-mode')).toBe('bands');
    expect(screen.getByText('Oct 16')).toBeTruthy();
    expect(screen.getByText('Showers')).toBeTruthy();
  });

  it('lets a long condition wrap to two lines in a column instead of cutting it', () => {
    stubBox(640, 360);
    const { container } = renderView(<WeatherWeekView {...viewProps({ forecast: [{ ...WEEK[0], description: 'Widespread Frost Then Sunny' }, ...WEEK.slice(1)] })} />);
    const text = screen.getByText('Widespread Frost Then Sunny');
    expect(text.className).toContain('line-clamp-2');
    expect(text.className).not.toContain('truncate');
    expect(container.querySelector('[data-weather-day]')).toBeTruthy();
  });

  it('falls back to the plain day list in a wide box too short for columns', () => {
    stubBox(640, 120);
    const { container } = renderView(<WeatherWeekView {...viewProps()} />);
    expect(container.querySelector('[data-weather-week-mode]')?.getAttribute('data-weather-week-mode')).toBe('list');
    expect(screen.queryByText('Showers')).toBeNull();
  });

  it('honours daysToShow and the stat toggles', () => {
    stubBox(640, 360);
    const { container } = renderView(<WeatherWeekView {...viewProps({}, { daysToShow: 3, showWind: false, showPrecipitation: false })} />);
    expect(container.querySelectorAll('[data-weather-day]')).toHaveLength(3);
    expect(screen.queryByText('70%')).toBeNull();
    expect(screen.queryByText(/mph/)).toBeNull();
  });

  it('scales the bars to the days drawn, even below the full-screen three-day floor', () => {
    stubBox(640, 360);
    const { container } = renderView(<WeatherWeekView {...viewProps({}, { daysToShow: 1 })} />);
    expect(container.querySelectorAll('[data-weather-day]')).toHaveLength(1);
    // Today alone is 41 to 58, so its bar fills the whole track.
    expect(screen.getByText('41° – 58°')).toBeTruthy();
    expect(screen.queryByText('33° – 61°')).toBeNull();
  });

  it('shows the forecast empty state with no days', () => {
    stubBox(640, 360);
    renderView(<WeatherWeekView {...viewProps({ forecast: [] })} />);
    expect(screen.getByText('No forecast data')).toBeTruthy();
  });
});
