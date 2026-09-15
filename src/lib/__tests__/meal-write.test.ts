import { describe, it, expect } from 'vitest';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { mealWriteBody } from '../meal-write';

const meal = { id: 'm-1', name: 'Tacos' } as SavedMeal;
const entry = { date: '2026-09-15', slot: 'dinner', mealId: 'm-1' } as PlannedMeal;

describe('mealWriteBody', () => {
  it('passes through only the fields the caller changed', () => {
    expect(mealWriteBody({ plan: [entry] }, true)).toEqual({ plan: [entry] });
    expect(mealWriteBody({ savedMeals: [meal] }, true)).toEqual({ savedMeals: [meal] });
  });

  it('does not confirm a write that still carries data', () => {
    expect(mealWriteBody({ plan: [entry] }, true)).not.toHaveProperty('force');
    expect(
      mealWriteBody({ savedMeals: [], plan: [entry] }, true),
    ).not.toHaveProperty('force');
  });

  /* The server's empty-overwrite guard refuses an empty array against stored
   * data unless the caller confirms. Clearing the last planned week is a real
   * user action, and with partial writes it no longer rides along with a
   * non-empty savedMeals to slip past the guard. */
  it('confirms a clear the user made against loaded data', () => {
    expect(mealWriteBody({ plan: [] }, true)).toEqual({ plan: [], force: true });
    expect(mealWriteBody({ savedMeals: [], plan: [] }, true)).toEqual({
      savedMeals: [],
      plan: [],
      force: true,
    });
  });

  /* A surface whose GET failed holds empty arrays it never received. It must
   * not be able to confirm away data it has never seen. */
  it('refuses to confirm a clear from a surface that never loaded', () => {
    expect(mealWriteBody({ plan: [] }, false)).not.toHaveProperty('force');
  });

  it('leaves an empty write alone rather than confirming nothing', () => {
    expect(mealWriteBody({}, true)).not.toHaveProperty('force');
  });
});
