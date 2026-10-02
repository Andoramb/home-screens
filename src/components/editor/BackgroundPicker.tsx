'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import type { BackgroundRotation, BackgroundRotationSourceId, BackgroundShade } from '@/types/config';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import Button from '@/components/ui/Button';
import LocalBackgrounds from './LocalBackgrounds';
import UnsplashBrowser from './UnsplashBrowser';
import NasaBrowser from './NasaBrowser';
import ImmichBrowser from './ImmichBrowser';
import ImageBrowserModal from './ImageBrowserModal';
import { Lock, Plus, X, RefreshCw } from 'lucide-react';
import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import Toggle from '@/components/ui/Toggle';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';
import { eventBus } from '@/lib/event-bus';

interface ImmichAlbumOption { id: string; name: string; assetCount: number }
interface ImmichPersonOption { id: string; name: string }

/** A scrollable list of checkboxes, one per option — shared shape for the
 *  Immich album/person(+)/person(-) pickers, all of which take multiple
 *  selections now (see BackgroundRotation.immichAlbumIds/immichPersonIds*). */
function CheckboxOptionList({ options, selected, onToggle, emptyLabel }: {
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string, checked: boolean) => void;
  emptyLabel: string;
}) {
  if (options.length === 0) {
    return <p className="text-[10px] text-hs-text-faint">{emptyLabel}</p>;
  }
  return (
    <div className="max-h-28 overflow-y-auto space-y-1 rounded bg-hs-card border border-hs-border-strong px-2 py-1.5">
      {options.map((opt) => (
        <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.includes(opt.id)}
            onChange={(e) => onToggle(opt.id, e.target.checked)}
            className="rounded border-hs-border-strong"
          />
          <span className="text-[10px] text-hs-text-body truncate">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function ImmichRotationFields({ rotation, onChange }: {
  rotation: BackgroundRotation;
  onChange: (updates: Partial<BackgroundRotation>) => void;
}) {
  const t = useTranslate('editor');
  const [albums, setAlbums] = useState<ImmichAlbumOption[]>([]);
  const [people, setPeople] = useState<ImmichPersonOption[]>([]);

  const fetchOptions = useCallback(async () => {
    const [albumRes, peopleRes] = await Promise.all([
      editorFetch('/api/immich/albums').catch(() => null),
      editorFetch('/api/immich/people').catch(() => null),
    ]);
    if (albumRes?.ok) setAlbums(await albumRes.json());
    if (peopleRes?.ok) setPeople(await peopleRes.json());
  }, []);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  const albumIds = rotation.immichAlbumIds ?? [];
  const personIds = rotation.immichPersonIds ?? [];
  const personIdsExclude = rotation.immichPersonIdsExclude ?? [];

  const toggleIn = (field: 'immichAlbumIds' | 'immichPersonIds' | 'immichPersonIdsExclude', current: string[], id: string, checked: boolean) => {
    const next = checked ? [...current, id] : current.filter((x) => x !== id);
    onChange({ [field]: next.length > 0 ? next : undefined });
  };

  const personOptions = people.map((p) => ({ id: p.id, label: p.name }));

  return (
    <>
      <label className="block">
        <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.albumLabel')}</span>
        <div className="mt-0.5">
          <CheckboxOptionList
            options={albums.map((a) => ({ id: a.id, label: t('backgroundPicker.immich.albumOption', { name: a.name, count: a.assetCount }) }))}
            selected={albumIds}
            onToggle={(id, checked) => toggleIn('immichAlbumIds', albumIds, id, checked)}
            emptyLabel={t('backgroundPicker.immich.noAlbums')}
          />
        </div>
        <span className="block mt-1 text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.anyAlbum')}</span>
      </label>
      <label className="block">
        <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.personPlusLabel')}</span>
        <div className="mt-0.5">
          <CheckboxOptionList
            options={personOptions}
            selected={personIds}
            onToggle={(id, checked) => toggleIn('immichPersonIds', personIds, id, checked)}
            emptyLabel={t('backgroundPicker.immich.noPeople')}
          />
        </div>
      </label>
      <label className="block">
        <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.personMinusLabel')}</span>
        <div className="mt-0.5">
          <CheckboxOptionList
            options={personOptions}
            selected={personIdsExclude}
            onToggle={(id, checked) => toggleIn('immichPersonIdsExclude', personIdsExclude, id, checked)}
            emptyLabel={t('backgroundPicker.immich.noPeople')}
          />
        </div>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={rotation.immichFavoritesOnly || false}
          onChange={(e) => onChange({ immichFavoritesOnly: e.target.checked || undefined })}
          className="rounded border-hs-border-strong"
        />
        <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.favoritesOnly')}</span>
      </label>
    </>
  );
}

/**
 * Local-source rotation fields: a folder picker for `rotation.localFolder`,
 * reusing the exact same `ImageBrowserModal` `manage-directory` mode and
 * `/api/backgrounds?directory=` preview pattern the Photo Slideshow module's
 * folder picker already uses (`PhotoSlideshowConfigSection.tsx`).
 */
function LocalRotationFields({ folder, onChange }: {
  folder: string;
  onChange: (folder: string) => void;
}) {
  const t = useTranslate('editor');
  const [showBrowser, setShowBrowser] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [photoCount, setPhotoCount] = useState(0);

  const fetchPreviews = useCallback(async (dir: string) => {
    try {
      const url = dir
        ? `/api/backgrounds?directory=${encodeURIComponent(dir)}`
        : '/api/backgrounds';
      const res = await editorFetch(url);
      if (res.ok) {
        const data = await res.json();
        const images = Array.isArray(data) ? data : [];
        setPhotoCount(images.length);
        setPreviewImages(images.slice(0, 4));
      }
    } catch {
      setPreviewImages([]);
      setPhotoCount(0);
    }
  }, []);

  useEffect(() => { fetchPreviews(folder); }, [folder, fetchPreviews]);

  return (
    <div>
      <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.local.folderLabel')}</span>
      <div className="flex gap-1.5 mt-1">
        <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate">
          {folder || t('backgroundPicker.local.allPhotosRoot')}
        </div>
        <Button size="sm" onClick={() => setShowBrowser(true)}>
          {t('backgroundPicker.local.browse')}
        </Button>
      </div>
      {photoCount > 0 && (
        <div className="mt-1.5">
          <span className="text-[10px] text-hs-text-faint">
            {photoCount === 1
              ? t('backgroundPicker.local.photoCountOne', { count: photoCount })
              : t('backgroundPicker.local.photoCountOther', { count: photoCount })}
          </span>
          <div className="flex gap-1 mt-1 overflow-x-auto">
            {previewImages.map((img) => (
              <img
                key={img}
                src={img}
                alt=""
                loading="lazy"
                className="w-12 h-12 rounded object-cover flex-shrink-0 border border-hs-border-strong"
              />
            ))}
          </div>
        </div>
      )}
      {photoCount === 0 && (
        <p className="text-[10px] text-hs-text-faint mt-1">{t('backgroundPicker.local.noPhotosInFolder')}</p>
      )}
      {showBrowser && (
        <ImageBrowserModal
          mode="manage-directory"
          initialDirectory={folder}
          onSelectDirectory={(dir) => {
            onChange(dir);
            fetchPreviews(dir);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}

/** Extracts a collection ID from `.../collections/ID/anything`; a bare ID (no
 *  URL shape) passes through unchanged. Shared by `CollectionsRotationFields`. */
const COLLECTION_URL_RE = /\/collections\/([^/]+)/;
function parseCollectionId(raw: string): string {
  const trimmed = raw.trim();
  const match = COLLECTION_URL_RE.exec(trimmed);
  return match ? match[1] : trimmed;
}

interface CollectionValidation {
  status: 'idle' | 'loading' | 'ok' | 'error';
  title?: string;
  totalPhotos?: number;
  coverPhotoUrl?: string | null;
  error?: string;
}

/**
 * Collections-mode rotation fields: a repeatable list of Unsplash collection
 * ID/URL inputs. Each row validates itself against
 * `/api/unsplash/collections/<id>` on blur (same debounce-on-commit shape as
 * the `missingPath` HEAD-check above) so a mistyped ID surfaces before the
 * screen ships with it.
 */
function CollectionsRotationFields({ collections, onChange }: {
  collections: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslate('editor');
  const [validations, setValidations] = useState<Record<number, CollectionValidation>>({});
  // Local, uncommitted text per row — a row is only parsed into an ID and
  // pushed up to config on blur, so an in-progress URL paste doesn't get
  // rewritten mid-keystroke into whatever the regex extracts from it yet.
  // Initialized from the incoming config once; the parent remounts this
  // component (via `key={selectedScreenId}`) on screen switch, so it never
  // needs to resync afterward.
  const [rows, setRows] = useState<string[]>(collections.length > 0 ? collections : ['']);

  const validateRow = useCallback(async (index: number, id: string) => {
    if (!id) {
      setValidations((prev) => { const next = { ...prev }; delete next[index]; return next; });
      return;
    }
    setValidations((prev) => ({ ...prev, [index]: { status: 'loading' } }));
    try {
      const res = await editorFetch(`/api/unsplash/collections/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setValidations((prev) => ({ ...prev, [index]: { status: 'error', error: t('backgroundPicker.unsplash.collectionNotFound') } }));
        return;
      }
      const data = await res.json();
      setValidations((prev) => ({
        ...prev,
        [index]: { status: 'ok', title: data.title, totalPhotos: data.totalPhotos, coverPhotoUrl: data.coverPhotoUrl },
      }));
    } catch {
      setValidations((prev) => ({ ...prev, [index]: { status: 'error', error: t('backgroundPicker.unsplash.collectionNotFound') } }));
    }
  }, [t]);

  // Re-validate every already-saved row once on mount: this component
  // remounts on screen switch (`key={selectedScreenId}` in the parent), which
  // would otherwise wipe the title/thumb/count shown for collections that
  // were already validated before the user navigated away.
  useEffect(() => {
    rows.forEach((row, index) => {
      if (row.trim()) validateRow(index, row.trim());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount only; `rows` and `validateRow` change identity on every keystroke/callback rebuild and must not re-trigger this
  }, []);

  const updateRow = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    setRows(next);
  };

  const commitRow = (index: number, value: string) => {
    const parsed = parseCollectionId(value);
    const next = [...rows];
    next[index] = parsed;
    setRows(next);
    onChange(next.filter((id) => id.trim()));
    validateRow(index, parsed);
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next.length > 0 ? next : ['']);
    onChange(next.filter((id) => id.trim()));
    setValidations((prev) => { const next = { ...prev }; delete next[index]; return next; });
  };

  const addRow = () => setRows([...rows, '']);

  return (
    <div className="space-y-1.5">
      {rows.map((row, index) => {
        const validation = validations[index];
        return (
          <div key={index} className="space-y-1">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={row}
                onChange={(e) => updateRow(index, e.target.value)}
                onBlur={(e) => commitRow(index, e.target.value)}
                placeholder={t('backgroundPicker.unsplash.collectionPlaceholder')}
                className={'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent'}
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                aria-label={t('backgroundPicker.unsplash.removeCollection')}
                className="mt-0.5 shrink-0 rounded p-1 text-hs-text-faint hover:text-hs-danger hover:bg-hs-hover"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
            {validation?.status === 'loading' && (
              <span className="block text-[10px] text-hs-text-faint">{t('backgroundPicker.unsplash.checking')}</span>
            )}
            {validation?.status === 'error' && (
              <span className="block text-[10px] text-hs-danger">{validation.error}</span>
            )}
            {validation?.status === 'ok' && (
              <div className="flex items-center gap-1.5 text-[10px] text-hs-text-faint">
                {validation.coverPhotoUrl && (
                  <img src={validation.coverPhotoUrl} alt="" className="h-5 w-5 rounded object-cover" />
                )}
                <span className="truncate">
                  {t('backgroundPicker.unsplash.collectionValid', { title: validation.title || '', count: validation.totalPhotos ?? 0 })}
                </span>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1 text-[10px] text-hs-text-muted hover:text-hs-text-secondary"
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
        {t('backgroundPicker.unsplash.addCollection')}
      </button>
    </div>
  );
}

export default function BackgroundPicker() {
  const t = useTranslate('editor');
  // Opens on the backgrounds that ship with Home Screens. Unsplash used to be
  // the default tab and dead-ended in "add a free API key", so the first thing
  // anyone wants to change needed a signup first.
  const [tab, setTab] = useState<'unsplash' | 'nasa' | 'immich' | 'local'>('local');
  const { config, selectedDisplayId, selectedScreenId, updateScreen, updateScreenRotation, updateScreenShade } = useEditorStore();
  const { status: secretStatus } = useSecretStatus();
  const hasUnsplashKey = !!secretStatus.unsplash_access_key;
  const hasNasaKey = !!secretStatus.nasa_api_key;
  const hasImmichKey = !!secretStatus.immich_api_key && !!secretStatus.immich_url;

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
  const rotationSources = currentScreen?.backgroundRotation?.sources ?? [];
  // Explicit `unsplashMode` wins; older configs saved before it existed fall
  // back to inferring from a non-empty `unsplashCollections` array.
  const unsplashCollectionsMode = currentScreen?.backgroundRotation?.unsplashMode
    ? currentScreen.backgroundRotation.unsplashMode === 'collections'
    : (currentScreen?.backgroundRotation?.unsplashCollections?.length ?? 0) > 0;

  // Interval options. Re-built per locale (cheap; rebuilds only when `t`
  // identity changes). Labels run through `t()` so de-DE renders idiomatic
  // German plurals; the numeric `value` is the underlying minutes count.
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

  // Is the screen's own background file still on the hub? Checked when the
  // panel opens and whenever the path changes (one HEAD request). Only local
  // paths: a remote URL can't be checked from here without CORS trouble, and
  // a network hiccup is not a missing file, so errors are not flagged.
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

  // Force-refresh (item 5): fetches a new photo immediately, bypassing the
  // interval, and publishes it on the event bus so the editor preview
  // (useActiveBackground, wherever this screen's canvas is mounted) picks it
  // up at once instead of waiting for its next poll tick.
  const [refreshing, setRefreshing] = useState(false);
  const refreshNow = useCallback(async () => {
    if (!selectedScreenId || rotationSources.length === 0 || refreshing) return;
    setRefreshing(true);
    try {
      const res = await editorFetch(`/api/backgrounds/rotate?screenId=${encodeURIComponent(selectedScreenId)}&force=true`);
      if (res.ok) {
        const data = await res.json();
        eventBus.publish('background.forceRefresh', { screenId: selectedScreenId, path: data.path ?? null });
      }
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rotationSources/refreshing read fresh each render; selectedScreenId is the only thing this should re-create on
  }, [selectedScreenId]);

  if (!currentScreen || !selectedScreenId) return null;

  // Every rotation source, with whether it needs a key it doesn't have (shown
  // locked, same treatment as the static-tab locks below) and its own
  // settings block, keyed off the checked-sources array rather than one enum.
  const ROTATION_SOURCES: { id: BackgroundRotationSourceId; label: string; locked: boolean }[] = [
    { id: 'unsplash', label: t('backgroundPicker.sources.unsplash'), locked: !hasUnsplashKey },
    { id: 'nasa-apod', label: t('backgroundPicker.sources.nasaApod'), locked: !hasNasaKey },
    { id: 'immich', label: t('backgroundPicker.sources.immich'), locked: !hasImmichKey },
    { id: 'icloud', label: t('backgroundPicker.sources.icloud'), locked: false },
    { id: 'local', label: t('backgroundPicker.sources.local'), locked: false },
  ];

  // Checking the first source (or unchecking the last) is what turns rotation
  // on/off now — there is no separate enabled toggle. Query/interval defaults
  // are seeded the same way the old enable action used to.
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

  const shade = currentScreen.shade;
  const shadeEnabled = shade?.enabled ?? false;
  const setShadeEnabled = (enabled: boolean) => {
    if (!selectedScreenId) return;
    updateScreenShade(selectedScreenId, {
      enabled,
      style: shade?.style || 'topBottom',
      strength: shade?.strength ?? 40,
      color: shade?.color || '#000000',
    });
  };
  const updateShade = (updates: Partial<BackgroundShade>) => {
    if (!selectedScreenId) return;
    updateScreenShade(selectedScreenId, updates);
  };

  return (
    <AccordionSection title={t('backgroundPicker.title')}>
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
                {/* One row per source, checked = currently drawn from. Rotation
                    picks uniformly at random among every checked source each
                    interval, so several can run at once (e.g. Unsplash +
                    Immich). A source missing its key is still shown, locked,
                    same treatment as the static-tab locks below. */}
                <div className="space-y-1.5">
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
                                {/* Mode is stored explicitly (`unsplashMode`) rather than
                                    inferred from which field is non-empty, so switching
                                    the toggle back and forth keeps whatever was typed into
                                    the query field AND whatever collections were entered —
                                    neither gets discarded just because it's not the active
                                    one right now. */}
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
                                            // Seed one empty row the first time collections mode
                                            // is opened; leaves an existing array untouched.
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
                {/* Shared by whichever source gets picked each tick, not per-source. */}
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

      <PropertyGroup title={t('backgroundPicker.shadeGroup')} accent={1}>
        <Toggle
          label={t('backgroundPicker.shadeEnable')}
          checked={shadeEnabled}
          onChange={setShadeEnabled}
        />
        {shadeEnabled && shade && (
          <div className="space-y-2 mt-2">
            <label className="block">
              <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.shadeStyleLabel')}</span>
              <select
                value={shade.style}
                onChange={(e) => updateShade({ style: e.target.value as BackgroundShade['style'] })}
                className={rotationFieldClass}
              >
                <option value="even">{t('backgroundPicker.shadeStyles.even')}</option>
                <option value="topBottom">{t('backgroundPicker.shadeStyles.topBottom')}</option>
                <option value="edges">{t('backgroundPicker.shadeStyles.edges')}</option>
                <option value="both">{t('backgroundPicker.shadeStyles.both')}</option>
              </select>
            </label>
            <Slider
              label={t('backgroundPicker.shadeStrengthLabel')}
              value={shade.strength}
              min={0}
              max={100}
              step={5}
              displayValue={`${shade.strength}%`}
              onChange={(value) => updateShade({ strength: value })}
            />
            <ColorPicker
              label={t('backgroundPicker.shadeColorLabel')}
              value={shade.color}
              onChange={(value) => updateShade({ color: value })}
            />
          </div>
        )}
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
              onClick={() => setTab('local')}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-body bg-hs-card border border-hs-border-strong hover:bg-hs-hover transition-colors"
            >
              {t('backgroundPicker.missing.pickAnother')}
            </button>
            <button
              type="button"
              onClick={() => updateScreen(selectedScreenId, { backgroundImage: '' })}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md text-hs-text-body bg-hs-card border border-hs-border-strong hover:bg-hs-hover transition-colors"
            >
              {t('backgroundPicker.missing.useSolid')}
            </button>
          </div>
        </div>
      )}

      {/* These tabs pick a single fixed image; they're independent of the
          Auto-rotate section above, which drives a rotating background
          instead. Both can point at Unsplash, so callers land here confused
          about which one is "the" Unsplash setting without this line. */}
      <p className="text-[10px] text-hs-text-faint leading-relaxed">{t('backgroundPicker.pickerHint')}</p>

      {/* Two rows rather than one scrolling row: four tabs do not fit across a
          288px panel, and a strip that scrolls sideways hid Immich behind an
          edge nothing advertised. */}
      <div className="grid grid-cols-2 gap-1 rounded-md bg-hs-card p-0.5">
        {/* Backgrounds first: it is the only tab that always has something in
            it. The others carry a lock until their key is set up, so a dead
            end is visible before it is clicked. */}
        {([
          { id: 'local' as const, label: t('backgroundPicker.tabs.local'), locked: false },
          { id: 'unsplash' as const, label: 'Unsplash', locked: !hasUnsplashKey },
          { id: 'nasa' as const, label: t('backgroundPicker.tabs.nasa'), locked: !hasNasaKey },
          { id: 'immich' as const, label: 'Immich', locked: !hasImmichKey },
        ]).map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            data-testid={`background-tab-${entry.id}`}
            title={entry.locked ? t('backgroundPicker.needsKey') : undefined}
            className={`flex items-center justify-center gap-1 truncate rounded px-2 py-1.5 text-xs ${
              tab === entry.id
                ? 'bg-hs-hover text-hs-text-primary'
                : entry.locked
                  ? 'text-hs-text-faint hover:text-hs-text-muted'
                  : 'text-hs-text-muted hover:text-hs-text-secondary'
            }`}
          >
            {entry.locked && <Lock className="h-2.5 w-2.5" aria-hidden="true" />}
            {entry.label}
          </button>
        ))}
      </div>

      {/* One tab's contents can be much shorter than another's. Without a floor
          the panel collapses on every switch, the scroll container clamps, and
          the picker appears to jump back to the top of the settings panel. */}
      <div className="min-h-96">
        {tab === 'unsplash' && (
          <UnsplashBrowser selectedScreenId={selectedScreenId} hasUnsplashKey={hasUnsplashKey} />
        )}

        {tab === 'nasa' && (
          <NasaBrowser selectedScreenId={selectedScreenId} hasNasaKey={hasNasaKey} />
        )}

        {tab === 'immich' && (
          <ImmichBrowser selectedScreenId={selectedScreenId} hasImmichKey={hasImmichKey} />
        )}

        {tab === 'local' && (
          <LocalBackgrounds selectedScreenId={selectedScreenId} />
        )}
      </div>
    </AccordionSection>
  );
}
