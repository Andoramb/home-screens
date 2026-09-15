'use client';

import { useState, useCallback, useRef } from 'react';
import type { SavedMeal, PlannedMeal, MealSettings, TimeFormat } from '@/types/config';
import { DEFAULT_MEAL_SETTINGS, normalizeMealSettings } from '@/lib/meal-constants';
import { mealWriteBody, type MealDataWrite } from '@/lib/meal-write';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';

export function useMealsData() {
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [plan, setPlan] = useState<PlannedMeal[]>([]);
  const [groceryChecked, setGroceryChecked] = useState<string[]>([]);
  const [settings, setSettings] = useState<MealSettings>({ ...DEFAULT_MEAL_SETTINGS });
  // Household GlobalSettings.timeFormat, reported alongside the meal settings
  // (always present in the GET response). Meal surfaces resolve their effective
  // format against this when the shared settings carry no override.
  const [globalTimeFormat, setGlobalTimeFormat] = useState<TimeFormat>('12h');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // True once a GET has actually delivered the stored data. An empty array
  // only means "the user emptied it" after that; before it, this hook is
  // holding empty state it never received. See `mealWriteBody`.
  const loadedRef = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await editorFetch('/api/meals/data');
      if (!res.ok) return;
      const data = await res.json();
      loadedRef.current = true;
      setSavedMeals(Array.isArray(data.savedMeals) ? data.savedMeals : []);
      setPlan(Array.isArray(data.plan) ? data.plan : []);
      setGroceryChecked(Array.isArray(data.groceryChecked) ? data.groceryChecked : []);
      // Defensive client-side normalization — protects against partial/stale API
      // responses (e.g. an old server returning only some fields, or a proxy
      // dropping the settings block) that would otherwise crash subsequent renders.
      setSettings(normalizeMealSettings(data.settings));
      setGlobalTimeFormat(data.globalTimeFormat === '24h' ? '24h' : '12h');
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Partial write — pass only the half the action actually changed.
   *
   * Assigning a meal to a slot sends `{ plan }`; editing the library sends
   * `{ savedMeals }`; deleting a meal sends both, because it also prunes the
   * plan entries pointing at it. The API preserves omitted fields, so an open
   * editor modal and this phone can no longer overwrite each other's untouched
   * half.
   */
  const saveData = useCallback(async (changes: MealDataWrite): Promise<boolean> => {
    try {
      const res = await editorFetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mealWriteBody(changes, loadedRef.current)),
      });
      if (!res.ok) {
        setSaveError('Failed to save. Please try again.');
        return false;
      }
      return true;
    } catch (err) {
      if (isSessionExpired(err)) return false;
      setSaveError('Network error. Please try again.');
      return false;
    }
  }, []);

  /**
   * Settings-only PUT — does not round-trip savedMeals/plan/groceryChecked.
   *
   * The API preserves omitted fields, so this can't accidentally clobber a
   * concurrent meal write from another surface (the editor modal, Settings →
   * Meals, etc.). Use this whenever you're only changing the shared `MealSettings`.
   */
  const saveSettingsOnly = useCallback(async (next: MealSettings): Promise<boolean> => {
    try {
      const res = await editorFetch('/api/meals/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: next }),
      });
      if (!res.ok) {
        setSaveError('Failed to save settings. Please try again.');
        return false;
      }
      return true;
    } catch (err) {
      if (isSessionExpired(err)) return false;
      setSaveError('Network error. Please try again.');
      return false;
    }
  }, []);

  const toggleGroceryItem = useCallback(async (itemName: string) => {
    const lower = itemName.toLowerCase();
    // Optimistic update
    setGroceryChecked((prev) => {
      const idx = prev.indexOf(lower);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, lower];
    });
    try {
      const res = await editorFetch('/api/meals/grocery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: lower }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroceryChecked(data.groceryChecked ?? []);
      }
    } catch {
      /* silent */
    }
  }, []);

  return {
    savedMeals,
    setSavedMeals,
    plan,
    setPlan,
    groceryChecked,
    setGroceryChecked,
    settings,
    setSettings,
    globalTimeFormat,
    loading,
    saving,
    setSaving,
    saveError,
    setSaveError,
    saveData,
    saveSettingsOnly,
    toggleGroceryItem,
    fetchData,
  };
}
