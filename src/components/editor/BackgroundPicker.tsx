'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import type { BackgroundRotation, BackgroundShade } from '@/types/config';
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import LocalBackgrounds from './LocalBackgrounds';
import UnsplashBrowser from './UnsplashBrowser';
import NasaBrowser from './NasaBrowser';
import ImmichBrowser from './ImmichBrowser';
import { Lock, Plus, X } from 'lucide-react';
import AccordionSection from './AccordionSection';
import PropertyGroup from './PropertyGroup';
import Toggle from '@/components/ui/Toggle';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';

interface ImmichAlbumOption { id: string; name: string; assetCount: number }
interface ImmichPersonOption { id: string; name: string }

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

  const selectClass = 'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent';

  return (
    <>
      <label className="block">
        <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.albumLabel')}</span>
        <select
          value={rotation.immichAlbumId || ''}
          onChange={(e) => onChange({ immichAlbumId: e.target.value || undefined, immichPersonId: undefined })}
          className={selectClass}
        >
          <option value="">{t('backgroundPicker.immich.anyAlbum')}</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {t('backgroundPicker.immich.albumOption', { name: a.name, count: a.assetCount })}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.personLabel')}</span>
        <select
          value={rotation.immichPersonId || ''}
          onChange={(e) => onChange({ immichPersonId: e.target.value || undefined, immichAlbumId: undefined })}
          className={selectClass}
        >
          <option value="">{t('backgroundPicker.immich.anyone')}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
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
  const { config, selectedDisplayId, selectedScreenId, updateScreen } = useEditorStore();
  const { status: secretStatus } = useSecretStatus();
  const hasUnsplashKey = !!secretStatus.unsplash_access_key;
  const hasNasaKey = !!secretStatus.nasa_api_key;
  const hasImmichKey = !!secretStatus.immich_api_key && !!secretStatus.immich_url;

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
  const rotationSource = currentScreen?.backgroundRotation?.source || 'unsplash';
  const unsplashCollectionsMode = (currentScreen?.backgroundRotation?.unsplashCollections?.length ?? 0) > 0;

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

  if (!currentScreen || !selectedScreenId) return null;

  const rotationEnabled = currentScreen?.backgroundRotation?.enabled ?? false;
  const sourceKeyMissing =
    (rotationSource === 'unsplash' && !hasUnsplashKey) ||
    (rotationSource === 'nasa-apod' && !hasNasaKey) ||
    (rotationSource === 'immich' && !hasImmichKey);
  // iCloud Shared Albums need no API key, so rotation is always offerable.
  const anySourceAvailable = true;

  const setRotationEnabled = (enabled: boolean) => {
    if (!selectedScreenId) return;
    const current = currentScreen?.backgroundRotation;
    const updated: BackgroundRotation = {
      enabled,
      source: current?.source || (hasUnsplashKey ? 'unsplash' : hasNasaKey ? 'nasa-apod' : hasImmichKey ? 'immich' : 'icloud'),
      query: current?.query || 'nature landscape',
      intervalMinutes: current?.intervalMinutes || 60,
    };
    updateScreen(selectedScreenId, { backgroundRotation: updated });
  };

  const rotationFieldClass = 'mt-0.5 block w-full rounded bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1 focus:outline-none focus:border-hs-accent';

  const shade = currentScreen.shade;
  const shadeEnabled = shade?.enabled ?? false;
  const setShadeEnabled = (enabled: boolean) => {
    if (!selectedScreenId) return;
    const updated: BackgroundShade = {
      enabled,
      style: shade?.style || 'topBottom',
      strength: shade?.strength ?? 40,
      color: shade?.color || '#000000',
    };
    updateScreen(selectedScreenId, { shade: updated });
  };
  const updateShade = (updates: Partial<BackgroundShade>) => {
    if (!selectedScreenId || !shade) return;
    updateScreen(selectedScreenId, { shade: { ...shade, ...updates } });
  };

  return (
    <AccordionSection title={t('backgroundPicker.title')}>
      {anySourceAvailable && (
        <>
          <PropertyGroup title={t('backgroundPicker.statusGroup')} accent={1}>
            <Toggle
              label={t('backgroundPicker.autoRotate')}
              checked={rotationEnabled}
              onChange={setRotationEnabled}
            />
          </PropertyGroup>
          {rotationEnabled && (
            <PropertyGroup title={t('fields.rotation')} accent={2}>
              <div className="space-y-2">
                <label className="block">
                  <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.sourceLabel')}</span>
                  <select
                    value={rotationSource}
                    onChange={(e) => {
                      if (!selectedScreenId) return;
                      const source = e.target.value as BackgroundRotation['source'];
                      updateScreen(selectedScreenId, {
                        backgroundRotation: {
                          ...currentScreen.backgroundRotation!,
                          source,
                          query: source === 'unsplash' ? (currentScreen.backgroundRotation!.query || 'nature landscape') : '',
                          intervalMinutes: source === 'nasa-apod' ? 240 : (currentScreen.backgroundRotation!.intervalMinutes || 60),
                        },
                      });
                    }}
                    className={rotationFieldClass}
                  >
                    {/* Every option the stored value could be, always. Rendering
                        only the keyed ones made a stored `unsplash` display as
                        whatever happened to be first — iCloud — while the
                        Unsplash-only query field stayed visible underneath. */}
                    {(hasUnsplashKey || rotationSource === 'unsplash') && (
                      <option value="unsplash">{t('backgroundPicker.sources.unsplash')}</option>
                    )}
                    {(hasNasaKey || rotationSource === 'nasa-apod') && (
                      <option value="nasa-apod">{t('backgroundPicker.sources.nasaApod')}</option>
                    )}
                    {(hasImmichKey || rotationSource === 'immich') && (
                      <option value="immich">{t('backgroundPicker.sources.immich')}</option>
                    )}
                    <option value="icloud">{t('backgroundPicker.sources.icloud')}</option>
                  </select>
                  {sourceKeyMissing && (
                    <span
                      className="mt-1 block text-[10px] leading-relaxed text-hs-warning"
                      data-testid="background-source-key-missing"
                    >
                      {t('backgroundPicker.sourceKeyMissing')}
                    </span>
                  )}
                </label>
                {rotationSource === 'unsplash' && (
                  <>
                    {/* Mode is inferred from data, not stored separately: a
                        non-empty `unsplashCollections` means collections mode,
                        otherwise the free-text query. Matches this codebase's
                        preference for deriving UI state from config rather
                        than tracking UI-only state. */}
                    <div className="grid grid-cols-2 gap-1 rounded-md bg-hs-card p-0.5">
                      {([
                        { id: 'query' as const, label: t('backgroundPicker.unsplash.modeQuery') },
                        { id: 'collections' as const, label: t('backgroundPicker.unsplash.modeCollections') },
                      ]).map((entry) => {
                        const active = entry.id === (unsplashCollectionsMode ? 'collections' : 'query');
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              if (!selectedScreenId) return;
                              updateScreen(selectedScreenId, {
                                backgroundRotation: {
                                  ...currentScreen.backgroundRotation!,
                                  unsplashCollections: entry.id === 'collections'
                                    ? (currentScreen.backgroundRotation!.unsplashCollections?.length ? currentScreen.backgroundRotation!.unsplashCollections : [''])
                                    : undefined,
                                },
                              });
                            }}
                            className={`truncate rounded px-2 py-1 text-[11px] ${
                              active ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
                            }`}
                          >
                            {entry.label}
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
                          updateScreen(selectedScreenId, {
                            backgroundRotation: { ...currentScreen.backgroundRotation!, unsplashCollections: ids },
                          });
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
                            updateScreen(selectedScreenId, {
                              backgroundRotation: { ...currentScreen.backgroundRotation!, query: e.target.value },
                            });
                          }}
                          placeholder={t('backgroundPicker.searchQueryPlaceholder')}
                          className={rotationFieldClass}
                        />
                      </label>
                    )}
                  </>
                )}
                {rotationSource === 'icloud' && (
                  <label className="block">
                    <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.icloud.albumLabel')}</span>
                    <input
                      type="url"
                      value={currentScreen.backgroundRotation!.icloudAlbumUrl || ''}
                      onChange={(e) => {
                        if (!selectedScreenId) return;
                        updateScreen(selectedScreenId, {
                          backgroundRotation: { ...currentScreen.backgroundRotation!, icloudAlbumUrl: e.target.value || undefined },
                        });
                      }}
                      placeholder="https://www.icloud.com/sharedalbum/#..."
                      className={rotationFieldClass}
                    />
                    <span className="block mt-1 text-[10px] text-hs-text-faint leading-relaxed">
                      {t('backgroundPicker.icloud.albumHelp')}
                    </span>
                  </label>
                )}
                {rotationSource === 'immich' && (
                  <ImmichRotationFields
                    rotation={currentScreen.backgroundRotation!}
                    onChange={(updates) => {
                      if (!selectedScreenId) return;
                      updateScreen(selectedScreenId, {
                        backgroundRotation: { ...currentScreen.backgroundRotation!, ...updates },
                      });
                    }}
                  />
                )}
                <label className="block">
                  <span className="text-[10px] text-hs-text-faint">{t('backgroundPicker.rotateEveryLabel')}</span>
                  <select
                    value={currentScreen.backgroundRotation!.intervalMinutes}
                    onChange={(e) => {
                      if (!selectedScreenId) return;
                      updateScreen(selectedScreenId, {
                        backgroundRotation: { ...currentScreen.backgroundRotation!, intervalMinutes: Number(e.target.value) },
                      });
                    }}
                    className={rotationFieldClass}
                  >
                    {intervalOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                {rotationSource === 'nasa-apod' && (
                  <p className="text-[10px] text-hs-text-faint">
                    {t('backgroundPicker.nasaInfo')}
                  </p>
                )}
              </div>
            </PropertyGroup>
          )}
        </>
      )}

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
