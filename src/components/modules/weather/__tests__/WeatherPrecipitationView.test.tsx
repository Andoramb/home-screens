// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import type { MinutelyPrecip } from '@/lib/weather';
import type { WeatherConfig } from '@/types/config';
import WeatherPrecipitationView from '../WeatherPrecipitationView';

function renderView(minutely: MinutelyPrecip[], units: 'imperial' | 'metric' = 'imperial') {
  return render(
    <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
      <WeatherPrecipitationView
        config={{ view: 'precipitation' } as WeatherConfig}
        hourly={[]}
        forecast={[]}
        minutely={minutely}
        units={units}
        scaledFontSize={16}
        timeFormat="12h"
      />
    </I18nProvider>,
  );
}

/** Heights of the 60 bars, in order. */
function barHeights(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('.rounded-t-sm')].map((bar) => bar.style.height);
}

afterEach(cleanup);

describe('WeatherPrecipitationView', () => {
  it('calls a clear hour of trace readings dry and draws no bars', () => {
    // What Pirate Weather sends on a clear day: tiny nonzero rates, chances under 10%.
    const clear = Array.from({ length: 60 }, (_, i) => ({ time: i * 60, intensity: i % 3 ? 0.0002 : 0.02, probability: i % 10 }));
    const { container } = renderView(clear);

    expect(screen.getByText('No precipitation expected')).toBeTruthy();
    expect(screen.queryByText(/Stopping in/)).toBeNull();
    expect(barHeights(container).every((h) => h === '0%')).toBe(true);
  });

  it('measures bars against a downpour in the unit the rate is in', () => {
    const steady = (intensity: number) => Array.from({ length: 60 }, (_, i) => ({ time: i * 60, intensity, probability: 80 }));
    // 2 mm/h is a fifth of a metric downpour; 0.2 in/h is half an imperial one.
    expect(parseFloat(barHeights(renderView(steady(2), 'metric').container)[0])).toBeCloseTo(20);
    cleanup();
    expect(parseFloat(barHeights(renderView(steady(0.2), 'imperial').container)[0])).toBeCloseTo(50);
  });

  it('stretches the scale for a minute heavier than a downpour', () => {
    const minutely = Array.from({ length: 60 }, (_, i) => ({ time: i * 60, intensity: i === 0 ? 0.8 : 0.4, probability: 90 }));
    const heights = barHeights(renderView(minutely).container).map(parseFloat);
    expect(heights[0]).toBeCloseTo(100);
    expect(heights[1]).toBeCloseTo(50);
  });

  it('draws bars only for the minutes the summary counts', () => {
    const minutely = Array.from({ length: 60 }, (_, i) => ({ time: i * 60, intensity: i < 12 ? 0.2 : 0.001, probability: i < 12 ? 85 : 40 }));
    const { container } = renderView(minutely);

    expect(screen.getByText('Stopping in 12 min')).toBeTruthy();
    const heights = barHeights(container);
    expect(heights.slice(0, 12).every((h) => h !== '0%')).toBe(true);
    expect(heights.slice(12).every((h) => h === '0%')).toBe(true);
  });
});
