'use client';

import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { SavedMeal, PlannedMeal, MealSlotType, MealSettings } from '@/types/config';
import { filterPlanToWeek } from '@/lib/meal-constants';
import {
  assignPlanSlot,
  clearPlanSlot,
  setPlanSlotTime,
  clearPlanWeek,
  shufflePlanWeek,
  copyPlanWeek,
} from '@/lib/meal-plan-actions';
import type { MealDataWrite } from '@/lib/meal-write';
import { useTranslate } from '@/i18n';
import { getWeekDates, type MealsConfirmAction } from '../components/meals-shared';

interface MealsPlanActionsParams {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  setPlan: Dispatch<SetStateAction<PlannedMeal[]>>;
  saveData: (changes: MealDataWrite) => Promise<boolean>;
  settings: MealSettings;
  /** The viewed week, from `useMealsWeekNav` */
  weekDates: ReturnType<typeof getWeekDates>;
  /** Origin of the viewed week — needed to address the *previous* week */
  viewingWeekStart: Date;
  setPickingSlot: Dispatch<SetStateAction<{ date: string; slot: MealSlotType } | null>>;
  setConfirmAction: Dispatch<SetStateAction<MealsConfirmAction | null>>;
}

/**
 * Reads and writes of the meal plan for the currently-viewed week: slot
 * assignment, clearing, per-slot times, and the bulk actions (clear week,
 * shuffle, copy last week). Every write is optimistic — local state first,
 * then the PUT.
 */
export function useMealsPlanActions({
  savedMeals,
  plan,
  setPlan,
  saveData,
  settings,
  weekDates,
  viewingWeekStart,
  setPickingSlot,
  setConfirmAction,
}: MealsPlanActionsParams) {
  const t = useTranslate('remote');

  // Filter plan to viewed week
  const weekPlan = useMemo(
    () => filterPlanToWeek(plan, weekDates[0].date, weekDates[6].date),
    [plan, weekDates],
  );

  const getMealForSlot = useCallback((date: string, slot: MealSlotType): { planned: PlannedMeal | undefined; meal: SavedMeal | undefined } => {
    const planned = weekPlan.find((p) => p.date === date && p.slot === slot);
    const meal = planned?.mealId ? savedMeals.find((m) => m.id === planned.mealId) : undefined;
    return { planned, meal };
  }, [weekPlan, savedMeals]);

  /**
   * Apply one of the shared plan transforms optimistically, then persist. A
   * transform that had nothing to do hands back the same array, and there is
   * then nothing to save.
   */
  const applyToPlan = useCallback(async (next: PlannedMeal[]) => {
    if (next === plan) return;
    setPlan(next);
    await saveData({ plan: next });
  }, [plan, saveData, setPlan]);

  const assignMealToSlot = useCallback(async (date: string, slot: MealSlotType, mealId: string) => {
    setPickingSlot(null);
    await applyToPlan(assignPlanSlot(plan, date, slot, mealId));
  }, [plan, applyToPlan, setPickingSlot]);

  const clearSlot = useCallback(async (date: string, slot: MealSlotType) => {
    await applyToPlan(clearPlanSlot(plan, date, slot));
  }, [plan, applyToPlan]);

  const setSlotTime = useCallback(async (date: string, slot: MealSlotType, time: string | undefined) => {
    await applyToPlan(setPlanSlotTime(plan, date, slot, time));
  }, [plan, applyToPlan]);

  const clearAllPlan = useCallback(() => {
    setConfirmAction({
      title: t('mealsTab.confirm.clearWeek.title'),
      description: t('mealsTab.confirm.clearWeek.description'),
      confirmLabel: t('mealsTab.confirm.clearWeek.confirmLabel'),
      onConfirm: async () => {
        await applyToPlan(clearPlanWeek(plan, weekDates.map((d) => d.date)));
        setConfirmAction(null);
      },
    });
  }, [plan, weekDates, applyToPlan, setConfirmAction, t]);

  const suggestRandom = useCallback(async () => {
    const weekDateStrs = weekDates.map((d) => d.date);
    await applyToPlan(shufflePlanWeek(plan, savedMeals, settings.enabledSlots, weekDateStrs));
  }, [savedMeals, plan, weekDates, settings.enabledSlots, applyToPlan]);

  const copyLastWeek = useCallback(async () => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    // Pass the household's weekStartDay so the previous-week window aligns
    // correctly for Monday-start households. Without this, prevStart was rolled
    // back to a Sunday and the 7-day window was shifted by one day.
    const prevWeekDates = getWeekDates(prevStart, settings.weekStartDay).map((d) => d.date);
    await applyToPlan(copyPlanWeek(plan, prevWeekDates, weekDates.map((d) => d.date)));
  }, [plan, viewingWeekStart, weekDates, settings.weekStartDay, applyToPlan]);

  const hasPreviousWeekEntries = useMemo(() => {
    const prevStart = new Date(viewingWeekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    // Same fix as copyLastWeek — must honor weekStartDay or the previous-week
    // window is misaligned for Monday-start households.
    const prevWeekDates = getWeekDates(prevStart, settings.weekStartDay);
    return filterPlanToWeek(plan, prevWeekDates[0].date, prevWeekDates[6].date).length > 0;
  }, [plan, viewingWeekStart, settings.weekStartDay]);

  return {
    weekPlan,
    getMealForSlot,
    assignMealToSlot,
    clearSlot,
    setSlotTime,
    clearAllPlan,
    suggestRandom,
    copyLastWeek,
    hasPreviousWeekEntries,
  };
}
