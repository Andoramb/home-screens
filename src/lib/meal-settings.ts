import type { MealSettings, MealSlotType, TimeFormat, WeekStartDay } from '@/types/config';
import { DEFAULT_MEAL_SETTINGS } from './meal-constants';

/**
 * The rules for editing the shared meal settings, as pure transforms.
 *
 * Two surfaces edit `MealSettings` and they edit it differently: the editor's
 * Settings > Meals page persists each change as you make it, /remote's sheet
 * works on a draft behind a Save button. Their markup differs for good reason
 * too - the phone sheet is touch-sized, the editor page is not a touch surface
 * and its fields take part in the settings search. What should not differ is
 * what counts as a valid edit, and that is what lives here.
 *
 * Both copies already carried the same two rules (a plan keeps at least one
 * slot; clearing a time removes the key rather than storing an empty string)
 * with no shared owner, which is the shape that lets a fix land on one surface
 * and not the other.
 */

/**
 * Turn a meal slot on or off.
 *
 * Returns the settings unchanged when the toggle would leave no slots at all -
 * a week with nothing to fill is not a state either surface offers a way out
 * of. Callers detect the refusal by identity (`next === settings`) and skip
 * their save.
 */
export function toggleMealSlot(settings: MealSettings, slot: MealSlotType): MealSettings {
  const enabled = settings.enabledSlots.includes(slot);
  const enabledSlots = enabled
    ? settings.enabledSlots.filter((s) => s !== slot)
    : [...settings.enabledSlots, slot];
  if (enabledSlots.length === 0) return settings;
  return { ...settings, enabledSlots };
}

/**
 * Set or clear a slot's default serving time (24-hour `HH:MM`).
 *
 * Clearing deletes the key rather than storing an empty string: `HH:MM` is the
 * only shape the readers accept, and an empty string would fail
 * `isValidTimeString` on the next read.
 */
export function setMealSlotDefaultTime(
  settings: MealSettings,
  slot: MealSlotType,
  time: string | undefined,
): MealSettings {
  const defaultSlotTimes = { ...settings.defaultSlotTimes };
  if (time) {
    defaultSlotTimes[slot] = time;
  } else {
    delete defaultSlotTimes[slot];
  }
  return { ...settings, defaultSlotTimes };
}

/** Set the day the planning week starts on. */
export function setMealWeekStart(settings: MealSettings, weekStartDay: WeekStartDay): MealSettings {
  return { ...settings, weekStartDay };
}

/**
 * Set the meal time format, or `undefined` to follow the household setting.
 *
 * The explicit `undefined` is load-bearing: it overwrites any stored override,
 * and an undefined value serializes out of the PUT body so the key is gone
 * server-side too. Spreading an empty object instead would leave the old
 * override in place.
 */
export function setMealTimeFormat(
  settings: MealSettings,
  timeFormat: TimeFormat | undefined,
): MealSettings {
  return { ...settings, timeFormat };
}

/**
 * The settings a household starts with, freshly cloned.
 *
 * Both collections are copied because `DEFAULT_MEAL_SETTINGS` is a module-level
 * object: handing its arrays out would let an edit on one surface mutate the
 * defaults every other reader sees. Default times reset to none rather than to
 * the shipped defaults, which carry none.
 */
export function resetMealSettings(): MealSettings {
  return {
    ...DEFAULT_MEAL_SETTINGS,
    enabledSlots: [...DEFAULT_MEAL_SETTINGS.enabledSlots],
    defaultSlotTimes: {},
  };
}
