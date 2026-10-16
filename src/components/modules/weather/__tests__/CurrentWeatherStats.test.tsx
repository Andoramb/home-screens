// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { CurrentWeatherStats } from '../CurrentWeatherStats';
import { PRIOR_LAKE, hourlyRun, renderView, viewProps } from './view-test-helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T19:10:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CurrentWeatherStats chips', () => {
  it('adds the UV and sun-time chips only when their toggles are on', () => {
    const current = hourlyRun()[0];
    const { config } = viewProps({}, { showUV: true, showSunTimes: true });
    renderView(<CurrentWeatherStats config={config} current={current} units="imperial" fontSize="1em" timeFormat="12h" {...PRIOR_LAKE} />);
    expect(screen.getByTestId('weather-stat-uv').textContent).toBe('UV 3');
    expect(screen.getByTestId('weather-stat-sunrise').textContent).toMatch(/7:3\d AM/);
    expect(screen.getByTestId('weather-stat-sunset').textContent).toMatch(/6:3\d PM/);
  });

  it('shows nothing extra by default, and no sun chips without coordinates', () => {
    const current = hourlyRun()[0];
    const off = viewProps().config;
    const { unmount } = renderView(<CurrentWeatherStats config={off} current={current} units="imperial" fontSize="1em" timeFormat="12h" {...PRIOR_LAKE} />);
    expect(screen.queryByTestId('weather-stat-uv')).toBeNull();
    expect(screen.queryByTestId('weather-stat-sunrise')).toBeNull();
    unmount();
    const on = viewProps({}, { showSunTimes: true }).config;
    renderView(<CurrentWeatherStats config={on} current={current} units="imperial" fontSize="1em" timeFormat="12h" />);
    expect(screen.queryByTestId('weather-stat-sunrise')).toBeNull();
  });
});
