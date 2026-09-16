import { describe, it, expect } from 'vitest';
import type { PlannedMeal, SavedMeal } from '@/types/config';
import { mealRevision } from '../meal-revision';

const meal = { id: 'm1', name: 'Tacos' } as SavedMeal;
const entry = { date: '2026-09-15', slot: 'dinner', mealId: 'm1' } as PlannedMeal;

describe('mealRevision', () => {
  it('is stable for the same arrays', () => {
    expect(mealRevision({ savedMeals: [meal], plan: [entry] })).toBe(mealRevision({ savedMeals: [meal], plan: [entry] }));
  });

  it('moves when either array changes', () => {
    const base = mealRevision({ savedMeals: [meal], plan: [entry] });
    expect(mealRevision({ savedMeals: [], plan: [entry] })).not.toBe(base);
    expect(mealRevision({ savedMeals: [meal], plan: [] })).not.toBe(base);
  });

  /* Settings and grocery ticks are written on their own; they must not make
   * an unrelated plan edit conflict. */
  it('ignores everything but the two replaced arrays', () => {
    const a = mealRevision({ savedMeals: [meal], plan: [entry], groceryChecked: ['x'], settings: { weekStartDay: 'monday' } } as never);
    const b = mealRevision({ savedMeals: [meal], plan: [entry], groceryChecked: [], settings: {} } as never);
    expect(a).toBe(b);
  });
});
