'use client';

import { useState } from 'react';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useMealsTabData } from '../hooks/useMealsTabData';
import type { MealsSubView } from './meals-shared';
import MealsTabHeader from './MealsTabHeader';
import MealsSubNav from './MealsSubNav';
import MealsWeekNav from './MealsWeekNav';
import MealsWeekView from './MealsWeekView';
import MealsPlanView from './MealsPlanView';
import MealsLibraryView from './MealsLibraryView';
import MealsGroceryView from './MealsGroceryView';
import MealsSettingsSheet from './MealsSettingsSheet';
import ConfirmSheet from './ConfirmSheet';
import AtHomePill from './AtHomePill';

export default function MealsTab() {
  const locale = useFormattingLocale();
  const t = useTranslate('remote');
  const {
    savedMeals,
    weekPlan,
    settings,
    globalTimeFormat,
    loading,
    loadError,
    retryLoad,
    saving,
    saveError,
    setSaveError,
    form,
    weekDates,
    todayISO,
    currentHour,
    activeSlotType,
    isCurrentWeek,
    navigateWeek,
    jumpToToday,
    getMealForSlot,
    assignMealToSlot,
    setSlotText,
    clearSlot,
    setSlotTime,
    clearAllPlan,
    suggestRandom,
    copyLastWeek,
    hasPreviousWeekEntries,
    pickingSlot,
    setPickingSlot,
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
    groceryList,
    groceryStats,
    toggleGroceryItem,
    confirmAction,
    setConfirmAction,
    saveSettings,
  } = useMealsTabData();

  const [subView, setSubView] = useState<MealsSubView>('week');
  const [showSettings, setShowSettings] = useState(false);

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--hs-text-faint)' }}>{t('mealsTab.loading')}</div>
      </div>
    );
  }

  // Never an empty week: that reads as "nothing planned", and a meal saved
  // from here would be built on nothing.
  if (loadError) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }} data-testid="meals-load-error">
        <p role="alert" style={{ fontSize: 14, color: 'var(--hs-text-faint)', margin: 0 }}>{t('mealsTab.loadError')}</p>
        <button
          type="button"
          onClick={() => void retryLoad()}
          className="press-btn"
          style={{
            marginTop: 16,
            minHeight: 44,
            padding: '0 18px',
            borderRadius: 12,
            border: 'none',
            background: 'var(--hs-hover)',
            color: 'var(--hs-text-primary)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('mealsTab.retry')}
        </button>
      </div>
    );
  }

  // Format week date range for header
  const startDate = new Date(weekDates[0].date + 'T12:00:00');
  const endDate = new Date(weekDates[6].date + 'T12:00:00');
  const formatShort = (d: Date) => d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const weekLabel = isCurrentWeek ? t('mealsTab.weekLabel.thisWeek') : `${formatShort(startDate)} – ${formatShort(endDate)}`;

  return (
    <div>
      <MealsTabHeader todayISO={todayISO} onOpenSettings={() => setShowSettings(true)} />
      <AtHomePill style={{ marginTop: 8 }} />

      <MealsSubNav subView={subView} setSubView={setSubView} weekLabel={weekLabel} />

      {(subView === 'week' || subView === 'plan' || subView === 'grocery') && (
        <MealsWeekNav
          weekLabel={weekLabel}
          isCurrentWeek={isCurrentWeek}
          navigateWeek={navigateWeek}
          jumpToToday={jumpToToday}
        />
      )}

      {subView === 'week' && (
        <MealsWeekView
          savedMeals={savedMeals}
          plan={weekPlan}
          weekDates={weekDates}
          todayISO={todayISO}
          activeSlot={activeSlotType}
          currentHour={currentHour}
          getMealForSlot={getMealForSlot}
          settings={settings}
          globalTimeFormat={globalTimeFormat}
          setSubView={setSubView}
        />
      )}

      {subView === 'plan' && (
        <MealsPlanView
          savedMeals={savedMeals}
          plan={weekPlan}
          weekDates={weekDates}
          todayISO={todayISO}
          activeSlot={activeSlotType}
          currentHour={currentHour}
          getMealForSlot={getMealForSlot}
          globalTimeFormat={globalTimeFormat}
          assignMealToSlot={assignMealToSlot}
          setSlotText={setSlotText}
          clearSlot={clearSlot}
          setSlotTime={setSlotTime}
          clearAllPlan={clearAllPlan}
          suggestRandom={suggestRandom}
          copyLastWeek={copyLastWeek}
          hasPreviousWeek={hasPreviousWeekEntries}
          pickingSlot={pickingSlot}
          setPickingSlot={setPickingSlot}
          settings={settings}
          setSubView={setSubView}
        />
      )}

      {subView === 'library' && (
        <MealsLibraryView
          savedMeals={savedMeals}
          filteredMeals={filteredMeals}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterTag={filterTag}
          setFilterTag={setFilterTag}
          form={form}
          openNewMealForm={openNewMealForm}
          openEditMealForm={openEditMealForm}
          saveMealForm={saveMealForm}
          deleteMeal={deleteMeal}
          toggleFavorite={toggleFavorite}
          saving={saving}
          saveError={saveError}
        />
      )}

      {subView === 'grocery' && (
        <MealsGroceryView
          groceryList={groceryList}
          groceryStats={groceryStats}
          toggleGroceryItem={toggleGroceryItem}
        />
      )}

      {confirmAction && (
        <ConfirmSheet
          title={confirmAction.title}
          description={confirmAction.description}
          confirmLabel={confirmAction.confirmLabel}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {showSettings && (
        <MealsSettingsSheet
          settings={settings}
          globalTimeFormat={globalTimeFormat}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {saveError && !form.editingMeal && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--hs-danger)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            zIndex: 250,
            boxShadow: 'none',
            cursor: 'pointer',
          }}
          onClick={() => setSaveError(null)}
          role="alert"
        >
          {saveError}
        </div>
      )}

    </div>
  );
}
