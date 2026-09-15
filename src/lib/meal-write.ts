import type { SavedMeal, PlannedMeal } from '@/types/config';

/**
 * A partial write of the shared meal data (`data/meals.json`).
 *
 * Only the fields present here go on the wire. `PUT /api/meals/data` preserves
 * every omitted field, so two surfaces editing different halves stop
 * overwriting each other: the phone assigning Tuesday's dinner sends
 * `{ plan }` and leaves the meal library alone, the editor modal adding a meal
 * sends `{ savedMeals }` and leaves the plan alone. Sending a field you did not
 * change is what made whichever request landed second win the half it had
 * never touched, with the loser never learning.
 *
 * `settings` is deliberately not part of this shape: it has its own
 * settings-only writers (`saveSettingsOnly`, Settings > Meals) for exactly the
 * same reason.
 */
export interface MealDataWrite {
  savedMeals?: SavedMeal[];
  plan?: PlannedMeal[];
}

/**
 * Build the `PUT /api/meals/data` body for a partial write.
 *
 * `force` answers the server's empty-overwrite guard, which refuses an empty
 * `savedMeals` or `plan` against non-empty stored data unless the caller
 * confirms it meant it. An empty array is only intentional if the surface
 * loaded the stored data first, in which case it is the user clearing the last
 * planned week or deleting the last saved meal. A surface whose fetch failed is
 * holding empty arrays it never received, and the guard should keep refusing
 * those.
 *
 * Partial writes make this distinction matter. A combined write of both fields
 * slipped past the guard whenever either half was non-empty, so clearing the
 * whole plan only needed confirming when the library was empty too.
 */
export function mealWriteBody(
  changes: MealDataWrite,
  loaded: boolean,
): MealDataWrite & { force?: boolean } {
  const written = [changes.savedMeals, changes.plan].filter((a) => a !== undefined);
  const clearing = written.length > 0 && written.every((a) => a.length === 0);
  return clearing && loaded ? { ...changes, force: true } : changes;
}
