// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import WeatherRibbonView from '../WeatherRibbonView';
import { renderView, stubBox, viewProps } from './view-test-helpers';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T19:10:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('WeatherRibbonView', () => {
  it('draws the run with its warmest and coldest hour labelled and the sunset and sunrise marked', () => {
    stubBox(640, 360);
    renderView(<WeatherRibbonView {...viewProps({}, { hoursToShow: 24 })} />);
    expect(screen.getByText('Next 24 hours')).toBeTruthy();
    // The current reading sits in the title row.
    expect(screen.getByText('54°')).toBeTruthy();
    const callouts = screen.getAllByTestId('weather-ribbon-callout').map((el) => el.textContent);
    expect(callouts).toContain('61°');
    expect(callouts).toContain('41°');
    // 2 PM to 2 PM across a Prior Lake night: one sunset, one sunrise.
    expect(screen.getAllByTestId('weather-ribbon-sunset')).toHaveLength(1);
    expect(screen.getAllByTestId('weather-ribbon-sunrise')).toHaveLength(1);
  });

  it('draws no day and night marks without coordinates', () => {
    stubBox(640, 360);
    renderView(<WeatherRibbonView {...viewProps({ latitude: undefined, longitude: undefined }, { hoursToShow: 24 })} />);
    expect(screen.queryByTestId('weather-ribbon-sunset')).toBeNull();
    expect(screen.getAllByTestId('weather-ribbon-callout').length).toBeGreaterThan(0);
  });

  it('shows the empty state with fewer than two hours', () => {
    stubBox(640, 360);
    renderView(<WeatherRibbonView {...viewProps({ hourly: [] })} />);
    expect(screen.getByText('No weather data')).toBeTruthy();
  });
});
