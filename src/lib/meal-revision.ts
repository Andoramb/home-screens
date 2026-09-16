import type { PlannedMeal, SavedMeal } from '@/types/config';
import { contentRevision } from './content-revision';

/**
 * The revision a meal save has to quote back.
 *
 * `PUT /api/meals/data` replaces `savedMeals` and `plan` whole, so a client
 * that built its arrays from an older copy would silently drop whatever
 * another phone added since. The revision covers exactly those two arrays: a
 * settings or grocery change moves neither, so it never makes an unrelated
 * plan edit conflict. Server-only; clients only quote it.
 */
export function mealRevision(data: { savedMeals: SavedMeal[]; plan: PlannedMeal[] }): string {
  return contentRevision({ savedMeals: data.savedMeals, plan: data.plan });
}
