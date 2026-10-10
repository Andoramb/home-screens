'use client';

import { useState, useEffect, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import type { BackgroundRotationSourceId } from '@/types/config';
import LocalBackgrounds from './LocalBackgrounds';
import { Lock, RefreshCw } from 'lucide-react';
import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';
import { eventBus } from '@/lib/event-bus';
import { isUnsplashCollectionsMode } from '@/lib/unsplash-rotation-mode';
import { stopBackgroundRotation } from '@/lib/screen-background';
import { ImmichRotationFields, LocalRotationFields, CollectionsRotationFields } from './BackgroundRotationFields';
import BackgroundShadeFields from './BackgroundShadeFields';
import BackgroundEffectsFields from './BackgroundEffectsFields';

export default function BackgroundPicker() {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, selectedScreenId, updateScreen, updateScreenRotation } = useEditorStore();
  const { status: secretStatus } = useSecretStatus();
  const hasUnsplashKey = !!secretStatus.unsplash_access_key;
  const hasNasaKey = !!secretStatus.nasa_api_key;
  const hasImmichKey = !!secretStatus.immich_api_key && !!secretStatus.immich_url;

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
  const rotationSources = currentScreen?.backgroundRotation?.sources ?? [];
  const unsplashCollectionsMode = currentScreen?.backgroundRotation
    ? isUnsplashCollectionsMode(currentScreen.backgroundRotation)
    : false;

  const intervalOptions = useMemo<{ value: number; label: string }[]>(
    () => [
      { value: 15, label: t('backgroundPicker.intervals.minutes', { count: 15 }) },
      { value: 30, label: t('backgroundPicker.intervals.minutes', { count: 30 }) },
      { value: 60, label: t('backgroundPicker.intervals.hourSingular') },
      { value: 120, label: t('backgroundPicker.intervals.hours', { count: 2 }) },
      { value: 240, label: t('backgroundPicker.intervals.hours', { count: 4 }) },
      { value: 480, label: t('backgroundPicker.intervals.hours', { count: 8 }) },
    ],
    [t],
  );

  const backgroundPath = currentScreen?.backgroundImage ?? '';
  const [missingPath, setMissingPath] = useState<string | null>(null);
  useEffect(() => {
    if (!backgroundPath || !backgroundPath.startsWith('/')) {
      setMissingPath(null);
      return;
    }
    let cancelled = false;
    editorFetch(backgroundPath, { method: 'HEAD' })
      .then((res) => { if (!cancelled) setMissingPath(res.ok ? null : backgroundPath); })
      .catch(() => { if (!cancelled) setMissingPath(null); });
    return () => { cancelled = true; };
  }, [backgroundPath]);

  const [refreshing, setRefreshing] = useState(false);
  const refreshNow = async () => {
    if (!selectedScreenId || rotationSources.length === 0 || refreshing) return;
    setRefreshing(true);
    try {
      const res = await editorFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(selectedScreenId)}&force=true`);
      if (res.ok) {
        const data = await res.json();
        if (data.fresh) eventBus.publish('background.forceRefresh', { screenId: selectedScreenId, path: data.path ?? null });
      }
    } finally {
      setRefreshing(false);
    }
  };

  if (!currentScreen || !selectedScreenId) return null;

  const ROTATION_SOURCES: { id: BackgroundRotationSourceId; label: string; locked: boolean }[] = [
    { id: 'unsplash', label: t('backgroundPicker.sources.unsplash'), locked: !hasUnsplashKey },
    { id: 'nasa-apod', label: t('backgroundPicker.sources.nasaApod'), locked: !hasNasaKey },
    { id: 'immich', label: t('backgroundPicker.sources.immich'), locked: !hasImmichKey },
    { id: 'icloud', label: t('backgroundPicker.sources.icloud'), locked: false },
    { id: 'local', label: t('backgroundPicker.sources.local'), locked: false },
  ];

  const toggleRotationSource = (id: BackgroundRotationSourceId, checked: boolean) => {
    if (!selectedScreenId) return;
    const current = currentScreen.backgroundRotation?.sources ?? [];
    const sources = checked ? [...current, id] : current.filter((s) => s !== id);
    updateScreenRotation(selectedScreenId, {
      sources,
      query: currentScreen.backgroundRotation?.query || 'nature landscape',
      intervalMinutes: currentScreen.backgroundRotation?.intervalMinutes || 60,
    });
  };

  const rotationFieldClass = 'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent';

  return (
    <AccordionSection title={t('backgroundPicker.title')}>
      <BackgroundShadeFields screenId={selectedScreenId} shade={currentScreen.shade} />
      <BackgroundEffectsFields screenId={selectedScreenId} effects={currentScreen.effects} />

      <PropertyGroup
        title={t('backgroundPicker.sourcesGroup')}
        accent={2}
        titleExtra={
                <button
                  type="button"
                  onClick={refreshNow}
                  disabled={rotationSources.length === 0 || refreshing}
                  aria-label={t('backgroundPicker.refreshNow')}
                  title={t('backgroundPicker.refreshNow')}
                  data-testid="background-rotation-refresh"
                  className="mb-[7px] shrink-0 rounded p-1 text-hs-text-faint hover:text-hs-text-secondary hover:bg-hs-hover disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                </button>
              }
            >
              <div className="space-y-2">
                <LocalBackgrounds selectedScreenId={selectedScreenId} />
                <div className="space-y-2">
                  {ROTATION_SOURCES.map((entry) => {
                    const checked = rotationSources.includes(entry.id);
                    return (
                      <div key={entry.id}>
                        <label className={`flex items-center gap-2 ${entry.locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={entry.locked}
                            onChange={(e) => toggleRotationSource(entry.id, e.target.checked)}
                            className="rounded border-hs-border-strong"
                          />
                          <span className={`text-xs flex items-center gap-1 ${entry.locked ? 'text-hs-text-faint' : 'text-hs-text-body'}`}>
                            {entry.locked && <Lock className="h-2.5 w-2.5" aria-hidden="true" />}
                            {entry.label}
                          </span>
                        </label>
                        {entry.locked && checked && (
                          <span
                            className="mt-1 block text-[10px] leading-relaxed text-hs-warning"
                            data-testid="background-source-key-missing"
                          >
                            {t('backgroundPicker.sourceKeyMissing')}
                          </span>
                        )}
                        {checked && (
                          <div className="mt-1.5 ml-5 space-y-2">
                            {entry.id === 'unsplash' && (
                              <>
                                <div className="grid grid-cols-2 gap-1 rounded-md bg-hs-card p-0.5">
                                  {([
                                    { id: 'query' as const, label: t('backgroundPicker.unsplash.modeQuery') },
                                    { id: 'collections' as const, label: t('backgroundPicker.unsplash.modeCollections') },
                                  ]).map((mode) => {
                                    const active = mode.id === (unsplashCollectionsMode ? 'collections' : 'query');
                                    return (
                                      <button
                                        key={mode.id}
                                        type="button"
                                        onClick={() => {
                                          if (!selectedScreenId) return;
                                          updateScreenRotation(selectedScreenId, {
                                            unsplashMode: mode.id,
                                            unsplashCollections: mode.id === 'collections' && !currentScreen.backgroundRotation!.unsplashCollections?.length
                                              ? ['']
                                              : currentScreen.backgroundRotation!.unsplashCollections,
                                          });
                                        }}
                                        className={`truncate rounded px-2 py-1 text-[11px] ${
                                          active ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
                                        }`}
                                      >
                                        {mode.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                {unsplashCollectionsMode ? (
                                  <CollectionsRotationFields
                                    key={selectedScreenId}
                                    collections={currentScreen.backgroundRotation!.unsplashCollections || []}
                                    onChange={(ids) => {
                                      if (!selectedScreenId) return;
                                      updateScreenRotation(selectedScreenId, { unsplashCollections: ids });
                                    }}
                                  />
                                ) : (
                                  <label className="block">
                                    <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.searchQueryLabel')}</span>
                                    <input
                                      type="text"
                                      value={currentScreen.backgroundRotation!.query}
                                      onChange={(e) => {
                                        if (!selectedScreenId) return;
                                        updateScreenRotation(selectedScreenId, { query: e.target.value });
                                      }}
                                      placeholder={t('backgroundPicker.searchQueryPlaceholder')}
                                      className={rotationFieldClass}
                                    />
                                  </label>
                                )}
                              </>
                            )}
                            {entry.id === 'icloud' && (
                              <label className="block">
                                <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.icloud.albumLabel')}</span>
                                <input
                                  type="url"
                                  value={currentScreen.backgroundRotation!.icloudAlbumUrl || ''}
                                  onChange={(e) => {
                                    if (!selectedScreenId) return;
                                    updateScreenRotation(selectedScreenId, { icloudAlbumUrl: e.target.value || undefined });
                                  }}
                                  placeholder="https://www.icloud.com/sharedalbum/#..."
                                  className={rotationFieldClass}
                                />
                                <span className="block mt-1 text-[10px] text-hs-text-faint leading-relaxed">
                                  {t('backgroundPicker.icloud.albumHelp')}
                                </span>
                              </label>
                            )}
                            {entry.id === 'immich' && (
                              <ImmichRotationFields
                                rotation={currentScreen.backgroundRotation!}
                                onChange={(updates) => {
                                  if (!selectedScreenId) return;
                                  updateScreenRotation(selectedScreenId, updates);
                                }}
                              />
                            )}
                            {entry.id === 'nasa-apod' && (
                              <p className="text-[10px] text-hs-text-faint">
                                {t('backgroundPicker.nasaInfo')}
                              </p>
                            )}
                            {entry.id === 'local' && (
                              <LocalRotationFields
                                folder={currentScreen.backgroundRotation!.localFolder || ''}
                                onChange={(folder) => {
                                  if (!selectedScreenId) return;
                                  updateScreenRotation(selectedScreenId, { localFolder: folder || undefined });
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <label className="block">
                  <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.rotateEveryLabel')}</span>
                  <select
                    value={currentScreen.backgroundRotation?.intervalMinutes ?? 60}
                    onChange={(e) => {
                      if (!selectedScreenId) return;
                      updateScreenRotation(selectedScreenId, { intervalMinutes: Number(e.target.value) });
                    }}
                    className={rotationFieldClass}
                  >
                    {intervalOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </div>
      </PropertyGroup>

      {missingPath && (
        <div className="rounded-md border border-hs-danger/40 bg-hs-danger/10 px-2.5 py-2 space-y-1.5" data-testid="background-missing">
          <div className="text-[10px] text-hs-text-faint">{t('backgroundPicker.missing.label')}</div>
          <div className="font-mono text-[11px] text-hs-text-body break-all">{missingPath}</div>
          <p className="text-[11px] text-hs-danger flex gap-1.5">
            <span aria-hidden="true">⚠</span>
            <span>{t('backgroundPicker.missing.note')}</span>
          </p>
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                const group = document.getElementById('starter-group-theme');
                if (group?.getAttribute('aria-expanded') === 'false') group.click();
                group?.focus();
              }}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-body bg-hs-card border border-hs-border-strong hover:bg-hs-hover transition-colors"
            >
              {t('backgroundPicker.missing.pickAnother')}
            </button>
            <button
              type="button"
              onClick={() => updateScreen(selectedScreenId, {
                backgroundImage: '',
                ...(rotationSources.length ? { backgroundRotation: stopBackgroundRotation(currentScreen.backgroundRotation) } : {}),
              })}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-body bg-hs-card border border-hs-border-strong hover:bg-hs-hover transition-colors"
            >
              {t('backgroundPicker.missing.useSolid')}
            </button>
          </div>
        </div>
      )}
    </AccordionSection>
  );
}
