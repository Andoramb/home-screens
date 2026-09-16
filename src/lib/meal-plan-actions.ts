import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';
import { replaceWeekInPlan, copyWeekEntries } from './meal-constants';
import { generateRandomPlan } from './meal-shuffle';

/**
 * What the meal planner's actions do to the plan and the saved-meal library,
 * as pure transforms.
 *
 * Three surfaces drive these: /remote's Meals tab, which holds the plan in
 * React state and PUTs after each change, and the editor's meal-planner modal,
 * which is fully controlled and hands every change up through `onUpdate`. They
 * cannot share the stateful hooks - the modal has no state to put in them, and
 * the two deliberately differ on destructive actions (the editor acts and
 * offers an undo toast, the phone confirms first). What they had no business
 * writing twice is this: what "assign a meal to Tuesday dinner" actually does
 * to an array.
 *
 * It had already cost one double fix. Copying last week's plan has to build the
 * previous window with the household's `weekStartDay` or the seven days are
 * shifted by one for a Monday-start household; both copies carry that fix,
 * found and applied separately.
 *
 * Every transform returns the array it was given, unchanged and by identity,
 * when the action is a no-op. Callers use that to skip a save.
 */

/**
 * Put a meal in a slot, replacing whatever was there.
 *
 * The existing entry's own fields (`time`, `notes`, `customText`) are kept:
 * swapping Tuesday's dinner for a different meal should not silently drop the
 * serving time somebody set for it.
 */
export function assignPlanSlot(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  mealId: string,
): PlannedMeal[] {
  const existing = plan.find((p) => p.date === date && p.slot === slot);
  const rest = plan.filter((p) => !(p.date === date && p.slot === slot));
  return [...rest, { ...(existing ?? {}), date, slot, mealId }];
}

/** Empty one slot. */
export function clearPlanSlot(plan: PlannedMeal[], date: string, slot: MealSlotType): PlannedMeal[] {
  return plan.filter((p) => !(p.date === date && p.slot === slot));
}

/**
 * Set or clear one slot's serving time.
 *
 * An empty string counts as a clear and removes the field: `HH:MM` is the only
 * shape the readers accept, and a stored `""` fails `isValidTimeString` on the
 * next read. A slot with no meal in it has no time to set, so that is a no-op.
 */
export function setPlanSlotTime(
  plan: PlannedMeal[],
  date: string,
  slot: MealSlotType,
  time: string | undefined,
): PlannedMeal[] {
  const existing = plan.find((p) => p.date === date && p.slot === slot);
  if (!existing) return plan;
  const updated: PlannedMeal = { ...existing };
  if (time) {
    updated.time = time;
  } else {
    delete updated.time;
  }
  return plan.map((p) => (p === existing ? updated : p));
}

/** Drop every entry in the given week, leaving the other weeks alone. */
export function clearPlanWeek(plan: PlannedMeal[], weekDates: readonly string[]): PlannedMeal[] {
  const inWeek = new Set(weekDates);
  return plan.filter((p) => !inWeek.has(p.date));
}

/**
 * Fill the given week with a random pick from the library, replacing whatever
 * that week held. Other weeks are untouched. A household with no saved meals
 * has nothing to pick from.
 */
export function shufflePlanWeek(
  plan: PlannedMeal[],
  savedMeals: SavedMeal[],
  slots: MealSlotType[],
  weekDates: string[],
): PlannedMeal[] {
  if (savedMeals.length === 0) return plan;
  return replaceWeekInPlan(plan, weekDates, generateRandomPlan(savedMeals, slots, weekDates));
}

/**
 * Restamp one week's entries onto another. `fromDates` and `toDates` must both
 * be built with the household's `weekStartDay`, or the windows are shifted by a
 * day for a Monday-start household. An empty source week is a no-op.
 */
export function copyPlanWeek(
  plan: PlannedMeal[],
  fromDates: string[],
  toDates: string[],
): PlannedMeal[] {
  const restamped = copyWeekEntries(plan, fromDates, toDates);
  if (restamped.length === 0) return plan;
  return replaceWeekInPlan(plan, toDates, restamped);
}

/** Add a meal to the library, or replace the one that already has its id. */
export function upsertSavedMeal(savedMeals: SavedMeal[], meal: SavedMeal): SavedMeal[] {
  const known = savedMeals.some((m) => m.id === meal.id);
  return known ? savedMeals.map((m) => (m.id === meal.id ? meal : m)) : [...savedMeals, meal];
}

/**
 * Remove a meal from the library and every plan entry pointing at it.
 *
 * Both halves move together: a plan entry whose meal no longer exists renders
 * as an empty slot the user cannot clear.
 */
export function removeSavedMeal(
  savedMeals: SavedMeal[],
  plan: PlannedMeal[],
  mealId: string,
): { savedMeals: SavedMeal[]; plan: PlannedMeal[] } {
  return {
    savedMeals: savedMeals.filter((m) => m.id !== mealId),
    plan: plan.filter((p) => p.mealId !== mealId),
  };
}

/** Star or unstar a saved meal. */
export function toggleSavedMealFavorite(savedMeals: SavedMeal[], mealId: string): SavedMeal[] {
  return savedMeals.map((m) => (m.id === mealId ? { ...m, isFavorite: !m.isFavorite } : m));
}
