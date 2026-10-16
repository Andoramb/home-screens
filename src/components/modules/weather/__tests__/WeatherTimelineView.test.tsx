// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import WeatherTimelineView from '../WeatherTimelineView';
import { hourlyRun, renderView, stubBox, viewProps } from './view-test-helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T19:10:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WeatherTimelineView', () => {
  it('draws one column per hour up to hoursToShow in a wide box, starting at Now', () => {
    stubBox(640, 360);
    const { container } = renderView(<WeatherTimelineView {...viewProps({}, { hoursToShow: 12 })} />);
    expect(container.querySelector('[data-weather-timeline-mode]')?.getAttribute('data-weather-timeline-mode')).toBe('columns');
    expect(screen.getAllByTestId('weather-hour')).toHaveLength(12);
    expect(screen.getByText('Now')).toBeTruthy();
    expect(screen.getByText('Next 12 hours')).toBeTruthy();
    expect(screen.getByTestId('weather-timeline-spline').querySelector('path')).toBeTruthy();
  });

  it('runs the hours down the page as rows in a tall box, with the wind unit on every row', () => {
    stubBox(420, 600);
    const { container } = renderView(<WeatherTimelineView {...viewProps({}, { hoursToShow: 8 })} />);
    expect(container.querySelector('[data-weather-timeline-mode]')?.getAttribute('data-weather-timeline-mode')).toBe('rows');
    expect(screen.getAllByTestId('weather-hour')).toHaveLength(8);
    expect(screen.getAllByText('9 mph')).toHaveLength(8);
  });

  it('names the span by elapsed time, not by entry count, for a three-hourly source', () => {
    stubBox(640, 360);
    const threeHourly = hourlyRun(24).filter((_, i) => i % 3 === 0);
    renderView(<WeatherTimelineView {...viewProps({ hourly: threeHourly }, { hoursToShow: 8 })} />);
    expect(screen.getAllByTestId('weather-hour')).toHaveLength(8);
    expect(screen.getByText('Next 24 hours')).toBeTruthy();
  });

  it('shows the empty state with fewer than two hours', () => {
    stubBox(640, 360);
    renderView(<WeatherTimelineView {...viewProps({ hourly: [] })} />);
    expect(screen.getByText('No weather data')).toBeTruthy();
  });
});
