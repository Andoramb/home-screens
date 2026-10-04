import type { MealIngredient } from '@/types/config';

/**
 * A meal form's ingredient rows as they are saved: rows nobody typed a name
 * into are left out, and names and amounts lose their stray spaces.
 *
 * Both meal forms (the phone's and the editor's) save through this. A row
 * added and left empty used to be saved from the phone as an ingredient with
 * no name, which the grocery list then drew as a blank line that counted
 * toward the total and could not be ticked.
 *
 * Returns undefined for a meal with no ingredients, which is how a meal
 * without any is stored.
 */
export function ingredientsToSave(rows: readonly MealIngredient[]): MealIngredient[] | undefined {
  const kept = rows
    .filter((row) => typeof row.name === 'string' && row.name.trim())
    .map((row) => ({
      ...row,
      name: row.name.trim(),
      ...(row.amount !== undefined ? { amount: row.amount.trim() } : {}),
    }));
  return kept.length > 0 ? kept : undefined;
}
