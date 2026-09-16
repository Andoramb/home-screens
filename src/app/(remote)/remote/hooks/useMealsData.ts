'use client';

import { useState, useCallback } from 'react';
import type { SavedMeal, PlannedMeal, MealSettings, TimeFormat } from '@/types/config';
import { DEFAULT_MEAL_SETTINGS } from '@/lib/meal-constants';
import { MealClientError, MealSession, type MealEdit, type MealSnapshot } from '@/lib/meal-client';
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

  // Loads and saves share one session (`lib/meal-client.ts`): it keeps the
  // copy the hub last answered with, quotes its revision on every save, and
  // re-applies an edit to the hub's newer copy when somebody else saved first.
  const [session] = useState(() => new MealSession(editorFetch));

  const adoptData = useCallback((snapshot: MealSnapshot) => {
    setSavedMeals(snapshot.savedMeals);
    setPlan(snapshot.plan);
    setGroceryChecked(snapshot.groceryChecked);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const snapshot = await session.load();
      // A load answered while a save is out is older than that save's answer.
      if (!session.idle) return;
      adoptData(snapshot);
      setSettings(snapshot.settings);
      setGlobalTimeFormat(snapshot.globalTimeFormat);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [session, adoptData]);

  /**
   * Save one edit, written as a function of the copy it applies to (see
   * `MealEdit`). Return only the half the action changed: assigning a meal to
   * a slot returns `{ plan }`, editing the library `{ savedMeals }`, deleting a
   * meal both. The API preserves omitted fields, so an open editor modal and
   * this phone cannot overwrite each other's untouched half; the revision the
   * session quotes stops a stale copy of the same half replacing a newer one.
   *
   * Callers apply their optimistic state first. Once the last queued save is
   * answered, the hub's copy replaces it; on failure the last loaded copy
   * does, so the tab never keeps showing an edit that was not saved.
   */
  const saveData = useCallback(async (edit: MealEdit): Promise<boolean> => {
    try {
      const saved = await session.save(edit);
      if (session.idle) adoptData(saved);
      return true;
    } catch (err) {
      if (isSessionExpired(err)) return false;
      setSaveError(err instanceof MealClientError ? 'Failed to save. Please try again.' : 'Network error. Please try again.');
      if (session.current && session.idle) adoptData(session.current);
      return false;
    }
  }, [session, adoptData]);

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
