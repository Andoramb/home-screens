import { describe, it, expect } from 'vitest';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { mealWriteBody } from '../meal-write';

const meal = { id: 'm-1', name: 'Tacos' } as SavedMeal;
const entry = { date: '2026-09-15', slot: 'dinner', mealId: 'm-1' } as PlannedMeal;

describe('mealWriteBody', () => {
  it('passes through only the fields the caller changed', () => {
    expect(mealWriteBody({ plan: [entry] })).toEqual({ plan: [entry] });
    expect(mealWriteBody({ savedMeals: [meal] })).toEqual({ savedMeals: [meal] });
  });

  it('does not confirm a write that still carries data', () => {
    expect(mealWriteBody({ plan: [entry] })).not.toHaveProperty('force');
    expect(mealWriteBody({ savedMeals: [], plan: [entry] })).not.toHaveProperty('force');
  });

  /* The server's empty-overwrite guard refuses an empty array against stored
   * data unless the caller confirms. Clearing the last planned week is a real
   * user action, and with partial writes it no longer rides along with a
   * non-empty savedMeals to slip past the guard. */
  it('confirms a clear', () => {
    expect(mealWriteBody({ plan: [] })).toEqual({ plan: [], force: true });
    expect(mealWriteBody({ savedMeals: [], plan: [] })).toEqual({
      savedMeals: [],
      plan: [],
      force: true,
    });
  });

  it('leaves an empty write alone rather than confirming nothing', () => {
    expect(mealWriteBody({})).not.toHaveProperty('force');
  });
});
