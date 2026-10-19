import { describe, it, expect } from 'vitest';
import {
  RAIN_LIKELY_THRESHOLD,
  hasRainLikelyCondition,
  rainLikelyCondition,
  withRainLikelyCondition,
} from '../rain-map-visibility';
import { WEATHER_STATE_KEYS } from '../weather-state';
import type { ModuleVisibility } from '@/types/config';

describe('rain-map-visibility', () => {
  it('adds an inclusive numeric condition on today\'s rain chance', () => {
    expect(rainLikelyCondition()).toEqual({
      kind: 'numeric',
      sourceKey: WEATHER_STATE_KEYS.precipChanceToday,
      above: RAIN_LIKELY_THRESHOLD,
      aboveInclusive: true,
    });
  });

  it('turns visibility on and appends the condition when it was off', () => {
    expect(withRainLikelyCondition(undefined)).toEqual({ conditions: [rainLikelyCondition()] });
  });

  it('keeps existing conditions and settings', () => {
    const existing: ModuleVisibility = {
      conditions: [{ kind: 'time', startTime: '07:00', endTime: '21:00' }],
      whenUnknown: 'show',
    };
    expect(withRainLikelyCondition(existing)).toEqual({
      conditions: [existing.conditions[0], rainLikelyCondition()],
      whenUnknown: 'show',
    });
  });

  it('recognises a tuned bound as the same condition and leaves it alone', () => {
    const tuned: ModuleVisibility = {
      conditions: [{ kind: 'numeric', sourceKey: WEATHER_STATE_KEYS.precipChanceToday, above: 60 }],
    };
    expect(hasRainLikelyCondition(tuned)).toBe(true);
    expect(withRainLikelyCondition(tuned)).toBe(tuned);
  });

  it('does not mistake other weather keys or a text match for the preset', () => {
    expect(hasRainLikelyCondition(undefined)).toBe(false);
    expect(hasRainLikelyCondition({ conditions: [] })).toBe(false);
    expect(hasRainLikelyCondition({
      conditions: [{ kind: 'numeric', sourceKey: WEATHER_STATE_KEYS.precipChanceNow, above: 30 }],
    })).toBe(false);
    expect(hasRainLikelyCondition({
      conditions: [{ kind: 'state', sourceKey: WEATHER_STATE_KEYS.precipChanceToday, equals: '80' }],
    })).toBe(false);
  });
});
