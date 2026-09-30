'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MealSlotType, MealSettings } from '@/types/config';
import { useMealsData } from './useMealsData';
import { useMealsWeekNav } from './useMealsWeekNav';
import { useMealsPlanActions } from './useMealsPlanActions';
import { useMealsLibrary } from './useMealsLibrary';
import { useMealsGrocery } from './useMealsGrocery';
import type { MealsConfirmAction } from '../components/meals-shared';

const MEALS_POLL_MS = 15_000;

/**
 * Everything the Meals tab renders, wired together from focused hooks:
 * `useMealsData` (fetch/save), `useMealsWeekNav` (which week + wall clock),
 * `useMealsPlanActions` (plan CRUD), `useMealsLibrary` (saved meals + form),
 * and `useMealsGrocery` (derived list). This hook only owns the state those
 * pieces share — the slot picker and the confirm dialog — and the settings
 * write, which is the one save that bypasses the meal/plan round trip.
 */
export function useMealsTabData() {
  const {
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    groceryChecked,
    settings,
    setSettings,
    globalTimeFormat,
    loading,
    loadError,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveData,
    saveSettingsOnly,
    toggleGroceryItem,
    fetchData,
  } = useMealsData();

  const [pickingSlot, setPickingSlot] = useState<{ date: string; slot: MealSlotType } | null>(null);
  const [confirmAction, setConfirmAction] = useState<MealsConfirmAction | null>(null);

  const weekNav = useMealsWeekNav(settings);

  // Load once, again whenever the phone comes back to this page or back
  // onto the network, and every so often while it is open. A tab left open
  // on Sunday's plan would otherwise keep an hours-old copy, a grocery item
  // ticked on another phone would never show, and a load that failed during
  // a Wi-Fi blip would leave the tab empty for good.
  useEffect(() => {
    fetchData();
    const whenVisible = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', whenVisible);
    window.addEventListener('online', fetchData);
    const poll = setInterval(whenVisible, MEALS_POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', whenVisible);
      window.removeEventListener('online', fetchData);
      clearInterval(poll);
    };
  }, [fetchData]);

  const planActions = useMealsPlanActions({
    savedMeals,
    plan,
    setPlan,
    saveData,
    settings,
    weekDates: weekNav.weekDates,
    viewingWeekStart: weekNav.viewingWeekStart,
    setPickingSlot,
    setConfirmAction,
  });

  const library = useMealsLibrary({
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    saveData,
    saving,
    setSaving,
    setSaveError,
    setConfirmAction,
  });

  const grocery = useMealsGrocery({
    weekPlan: planActions.weekPlan,
    savedMeals,
    groceryChecked,
  });

  const saveSettings = useCallback(async (next: MealSettings): Promise<boolean> => {
    const prev = settings;
    setSettings(next); // optimistic update
    // Settings-only PUT — does not round-trip meals/plan, so it can't clobber
    // a concurrent meal write from the editor or another /remote tab.
    const ok = await saveSettingsOnly(next);
    if (!ok) {
      // Server rejected the write — revert local state so the UI matches
      // what's actually on disk. The useMealsData hook will have set
      // `saveError` which the toast already renders.
      setSettings(prev);
    }
    return ok;
  }, [settings, saveSettingsOnly, setSettings]);

  return {
    savedMeals,
    weekPlan: planActions.weekPlan,
    settings,
    globalTimeFormat,
    loading,
    loadError,
    retryLoad: fetchData,
    saving,
    saveError,
    setSaveError,
    form: library.form,
    weekDates: weekNav.weekDates,
    todayISO: weekNav.todayISO,
    currentHour: weekNav.currentHour,
    activeSlotType: weekNav.activeSlotType,
    isCurrentWeek: weekNav.isCurrentWeek,
    navigateWeek: weekNav.navigateWeek,
    jumpToToday: weekNav.jumpToToday,
    getMealForSlot: planActions.getMealForSlot,
    assignMealToSlot: planActions.assignMealToSlot,
    setSlotText: planActions.setSlotText,
    clearSlot: planActions.clearSlot,
    setSlotTime: planActions.setSlotTime,
    clearAllPlan: planActions.clearAllPlan,
    suggestRandom: planActions.suggestRandom,
    copyLastWeek: planActions.copyLastWeek,
    hasPreviousWeekEntries: planActions.hasPreviousWeekEntries,
    pickingSlot,
    setPickingSlot,
    searchQuery: library.searchQuery,
    setSearchQuery: library.setSearchQuery,
    filterTag: library.filterTag,
    setFilterTag: library.setFilterTag,
    filteredMeals: library.filteredMeals,
    openNewMealForm: library.openNewMealForm,
    openEditMealForm: library.openEditMealForm,
    saveMealForm: library.saveMealForm,
    deleteMeal: library.deleteMeal,
    toggleFavorite: library.toggleFavorite,
    groceryList: grocery.groceryList,
    groceryStats: grocery.groceryStats,
    toggleGroceryItem,
    confirmAction,
    setConfirmAction,
    saveSettings,
  };
}
