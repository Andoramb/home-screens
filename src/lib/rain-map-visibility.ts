/**
 * The one-click "only show when rain is likely" preset for the Rain Map.
 *
 * A radar that is empty on a dry day is wasted space, and the fix is a single
 * visibility condition on the host's `weather.precip_chance_today` key
 * (`weather-state.ts`). Most households will never find the Conditions
 * section on their own, so the Rain Map's config section offers the condition
 * as a button. These rules say what the button adds and how it recognises
 * the condition once it is there, whichever surface edits it afterwards.
 */

import type { ModuleVisibility, VisibilityCondition } from '@/types/config';
import { WEATHER_STATE_KEYS } from '@/lib/weather-state';

/** Percent at or above which "rain is likely". */
export const RAIN_LIKELY_THRESHOLD = 30;

/** The condition the button adds. */
export function rainLikelyCondition(): VisibilityCondition {
  return {
    kind: 'numeric',
    sourceKey: WEATHER_STATE_KEYS.precipChanceToday,
    above: RAIN_LIKELY_THRESHOLD,
    aboveInclusive: true,
  };
}

/**
 * Whether the module already follows today's rain chance. Any top-level
 * numeric condition on the key counts, whatever bound the household has
 * tuned it to since: the button's job is to get the condition in place, not
 * to police the number.
 */
export function hasRainLikelyCondition(visibility: ModuleVisibility | undefined): boolean {
  if (!visibility) return false;
  return visibility.conditions.some(
    (c) => c.kind === 'numeric' && c.sourceKey === WEATHER_STATE_KEYS.precipChanceToday,
  );
}

/**
 * The module's visibility with the rain condition in place: turned on if it
 * was off, the condition appended if it was missing, everything else kept.
 * Already there means unchanged, so a second click is harmless.
 */
export function withRainLikelyCondition(visibility: ModuleVisibility | undefined): ModuleVisibility {
  if (hasRainLikelyCondition(visibility)) return visibility as ModuleVisibility;
  return {
    ...(visibility ?? {}),
    conditions: [...(visibility?.conditions ?? []), rainLikelyCondition()],
  };
}
