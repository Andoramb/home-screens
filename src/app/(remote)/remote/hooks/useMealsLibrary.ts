'use client';

import { useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { SavedMeal, PlannedMeal } from '@/types/config';
import { normalizeTag } from '@/lib/meal-constants';
import {
  upsertSavedMeal,
  removeSavedMeal,
  toggleSavedMealFavorite,
} from '@/lib/meal-plan-actions';
import type { MealDataWrite } from '@/lib/meal-write';
import { useTranslate } from '@/i18n';
import { useMealForm } from './useMealForm';
import type { MealsConfirmAction } from '../components/meals-shared';

interface MealsLibraryParams {
  savedMeals: SavedMeal[];
  setSavedMeals: Dispatch<SetStateAction<SavedMeal[]>>;
  plan: PlannedMeal[];
  setPlan: Dispatch<SetStateAction<PlannedMeal[]>>;
  saveData: (changes: MealDataWrite) => Promise<boolean>;
  saving: boolean;
  setSaving: Dispatch<SetStateAction<boolean>>;
  setSaveError: Dispatch<SetStateAction<string | null>>;
  setConfirmAction: Dispatch<SetStateAction<MealsConfirmAction | null>>;
}

/**
 * The saved-meal library: search/tag filtering plus the add/edit/delete form
 * flow. Owns the form state (`useMealForm`) since nothing outside the library
 * view touches it.
 */
export function useMealsLibrary({
  savedMeals,
  setSavedMeals,
  plan,
  setPlan,
  saveData,
  saving,
  setSaving,
  setSaveError,
  setConfirmAction,
}: MealsLibraryParams) {
  const t = useTranslate('remote');

  const form = useMealForm();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string>('all');

  const openNewMealForm = () => {
    form.openNew(() => setSaveError(null));
  };

  const openEditMealForm = (meal: SavedMeal) => {
    form.openEdit(meal, () => setSaveError(null));
  };

  const saveMealForm = async () => {
    if (!form.formName.trim() || saving) return;
    setSaving(true);
    setSaveError(null);

    const newMeals = upsertSavedMeal(savedMeals, form.buildMealData());

    const ok = await saveData({ savedMeals: newMeals });
    setSaving(false);
    if (ok) {
      setSavedMeals(newMeals);
      form.setEditingMeal(null);
    }
  };

  const deleteMeal = () => {
    if (form.editingMeal === 'new' || form.editingMeal === null) return;
    const mealToDelete = form.editingMeal;
    setConfirmAction({
      title: t('mealsTab.confirm.deleteMeal.title', { name: mealToDelete.name }),
      description: t('mealsTab.confirm.deleteMeal.description'),
      confirmLabel: t('mealsTab.confirm.deleteMeal.confirmLabel'),
      onConfirm: async () => {
        const next = removeSavedMeal(savedMeals, plan, mealToDelete.id);
        setSavedMeals(next.savedMeals);
        setPlan(next.plan);
        form.setEditingMeal(null);
        setConfirmAction(null);
        // Both halves: deleting a meal also prunes the plan entries for it.
        await saveData(next);
      },
    });
  };

  const toggleFavorite = async (mealId: string) => {
    const newMeals = toggleSavedMealFavorite(savedMeals, mealId);
    setSavedMeals(newMeals);
    await saveData({ savedMeals: newMeals });
  };

  const filteredMeals = useMemo(() => {
    let result = savedMeals;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (filterTag === 'favorites') {
      result = result.filter((m) => m.isFavorite);
    } else if (filterTag !== 'all') {
      result = result.filter((m) => m.tags?.some((t) => normalizeTag(t) === filterTag));
    }
    return result;
  }, [savedMeals, searchQuery, filterTag]);

  return {
    form,
    searchQuery,
    setSearchQuery,
    filterTag,
    setFilterTag,
    filteredMeals,
    openNewMealForm,
    openEditMealForm,
    saveMealForm,
    deleteMeal,
    toggleFavorite,
  };
}
