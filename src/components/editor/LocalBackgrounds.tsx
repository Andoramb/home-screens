'use client';

import { useState, useEffect, useId } from 'react';
import { Check, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import ImageBrowserModal from './ImageBrowserModal';
import ImmichBrowser from './ImmichBrowser';
import NasaBrowser from './NasaBrowser';
import UnsplashBrowser from './UnsplashBrowser';
import { useEditorStore, getActiveScreens, getActiveDimensions, getActiveFullscreenTheme } from '@/stores/editor-store';
import FullscreenThemePreview from '@/components/ui/FullscreenThemePreview';
import { themeTileClass } from '@/components/editor/settings/shared/FullscreenThemeTile';
import { useTranslate, tOrFallback } from '@/i18n';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import {
  starterBackgroundsIn,
  type StarterBackground,
  type StarterBackgroundGroup,
} from '@/lib/starter-backgrounds';
import { isRotationActive, stopBackgroundRotation } from '@/lib/screen-background';

interface Props {
  selectedScreenId: string;
  hasUnsplashKey: boolean;
  hasNasaKey: boolean;
  hasImmichKey: boolean;
}

const GROUP_STORAGE_PREFIX = 'hs-background-group-';

function readGroupOpen(id: string): boolean {
  try {
    return localStorage.getItem(GROUP_STORAGE_PREFIX + id) !== 'closed';
  } catch {
    return true;
  }
}

/** Heading checkbox switches the group's tiles from "pick one" to "rotate through the selection". */
function StarterGroup({ id, title, count, checked, hint, onChange, children }: {
  id: StarterBackgroundGroup; title: string; count: string; checked: boolean; hint?: string;
  /** Omitted for a group that is a single choice and cannot rotate. */
  onChange?: (checked: boolean) => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  useEffect(() => { setOpen(readGroupOpen(id)); }, [id]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(GROUP_STORAGE_PREFIX + id, next ? 'open' : 'closed'); } catch { /* private mode */ }
  };
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div data-testid={`starter-source-${id}`} className="space-y-1.5">
      <div className="flex items-center gap-2">
        {onChange ? (
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-hs-text-body">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-hs-border-strong" />
            <span>{title}</span>
          </label>
        ) : (
          <span className="min-w-0 flex-1 text-xs text-hs-text-body">{title}</span>
        )}
        <button id={`starter-group-${id}`} type="button" onClick={toggle} aria-expanded={open}
          aria-controls={panelId} data-testid={`starter-group-${id}`}
          aria-label={checked ? `${title} ${count}` : title} className="flex items-center gap-1 rounded px-1 text-[10px] text-hs-text-muted hover:bg-hs-hover">
          <span>{checked ? count : ''}</span><Chevron size={11} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div id={panelId} className="space-y-1.5">
          {checked && hint && <p className="text-[10px] leading-relaxed text-hs-text-faint" data-testid={`starter-hint-${id}`}>{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

type PhotoSource = 'library' | 'unsplash' | 'nasa' | 'immich';

/** One specific photo as a fixed background, from the library (with upload) or a connected service. */
function SinglePhotoPicker({ selectedScreenId, onPickImage, hasKey }: {
  selectedScreenId: string;
  onPickImage: (url: string) => void;
  hasKey: Record<'unsplash' | 'nasa' | 'immich', boolean>;
}) {
  const t = useTranslate('editor');
  const [open, setOpen] = useState<PhotoSource | null>(null);
  const entries: { id: PhotoSource; label: string; locked: boolean }[] = [
    { id: 'library', label: t('backgroundPicker.pickOneLibrary'), locked: false },
    { id: 'unsplash', label: t('backgroundPicker.sources.unsplash'), locked: !hasKey.unsplash },
    { id: 'nasa', label: t('backgroundPicker.sources.nasaApod'), locked: !hasKey.nasa },
    { id: 'immich', label: t('backgroundPicker.sources.immich'), locked: !hasKey.immich },
  ];
  return (
    <div className="space-y-1.5" data-testid="single-photo-picker">
      <div className="text-[10px] text-hs-text-faint">{t('backgroundPicker.pickOneTitle')}</div>
      <div className="grid grid-cols-2 gap-1">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-expanded={entry.id === 'library' ? undefined : open === entry.id}
            data-testid={`pick-photo-${entry.id}`}
            onClick={() => setOpen(entry.id === 'library' ? 'library' : open === entry.id ? null : entry.id)}
            className={`flex min-w-0 items-center justify-center gap-1 rounded border px-2 py-1 text-[11px] ${entry.id === 'library' ? 'col-span-2 ' : ''}${
              open === entry.id ? 'border-hs-accent bg-hs-hover text-hs-text-primary' : 'border-hs-border-strong bg-hs-card text-hs-text-body hover:bg-hs-hover'
            }`}
          >
            {entry.locked && <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
            <span className="truncate">{entry.label}</span>
          </button>
        ))}
      </div>
      {open === 'unsplash' && <UnsplashBrowser selectedScreenId={selectedScreenId} hasUnsplashKey={hasKey.unsplash} />}
      {open === 'nasa' && <NasaBrowser selectedScreenId={selectedScreenId} hasNasaKey={hasKey.nasa} />}
      {open === 'immich' && <ImmichBrowser selectedScreenId={selectedScreenId} hasImmichKey={hasKey.immich} />}
      {open === 'library' && (
        <ImageBrowserModal mode="pick-image" onSelectImage={onPickImage} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

export default function LocalBackgrounds({ selectedScreenId, hasUnsplashKey, hasNasaKey, hasImmichKey }: Props) {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, updateScreen, updateScreenRotation } = useEditorStore();

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);

  if (!currentScreen || !config) return null;

  const rotation = currentScreen.backgroundRotation;
  const selectedSources = rotation?.sources ?? [];
  const selectSource = (id: StarterBackgroundGroup, checked: boolean) => {
    const sources = checked
      ? [...selectedSources.filter((source) => source !== id), id]
      : selectedSources.filter((source) => source !== id);
    updateScreenRotation(selectedScreenId, {
      sources, query: rotation?.query || 'nature landscape', intervalMinutes: rotation?.intervalMinutes || 60,
    });
  };
  // Walls are opt-in: nothing is in rotation until the user picks it.
  const selections = rotation?.starterBackgroundIds;
  const selectedIds = (group: StarterBackgroundGroup) => {
    const ids = selections?.[group] ?? [];
    return starterBackgroundsIn(group).filter((wall) => ids.includes(wall.id)).map((wall) => wall.id);
  };
  const setIncluded = (bg: StarterBackground, include: boolean) => {
    const group = bg.group;
    const ids = selectedIds(group);
    const next = include ? [...ids, bg.id] : ids.filter((id) => id !== bg.id);
    updateScreenRotation(selectedScreenId, { starterBackgroundIds: { ...selections, [group]: next } });
  };
  const selectionCount = (group: StarterBackgroundGroup) => `${selectedIds(group).length}/${starterBackgroundsIn(group).length}`;
  // Themes are a single choice: a rotation of several full-screen themes has no use.
  const rotating = (group: StarterBackgroundGroup) => group !== 'theme' && selectedSources.includes(group);
  const groupHint = (group: StarterBackgroundGroup) => (selectedIds(group).length === 0 ? t('backgroundPicker.pickToRotate') : undefined);

  // Picking any background turns rotation off: a rotating screen would paint
  // over the choice within the hour, which reads as "it didn't save".
  const pick = (backgroundImage: string) => {
    const updates: Record<string, unknown> = { backgroundImage };
    if (isRotationActive(currentScreen?.backgroundRotation)) {
      updates.backgroundRotation = stopBackgroundRotation(currentScreen.backgroundRotation);
    }
    updateScreen(selectedScreenId, updates);
  };

  // Tiles follow the selected display's orientation, so a landscape wall's
  // thumbnails are landscape too.
  const dims = getActiveDimensions(config, selectedDisplayId);
  const landscape = dims.width > dims.height;
  const tileAspect = landscape ? 'aspect-video' : 'aspect-[9/16]';
  const tileGrid = landscape ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-4 gap-1.5';
  const isCurrent = (path: string) => currentScreen.backgroundImage === path;
  const isIncluded = (bg: StarterBackground) => selectedIds(bg.group).includes(bg.id);
  // Group in rotation mode: a tile is highlighted when it is in the rotation. Otherwise it is highlighted when it is the fixed wall.
  const isMarked = (bg: StarterBackground) =>
    rotating(bg.group) ? isIncluded(bg) : isCurrent(bg.path) && !isRotationActive(currentScreen.backgroundRotation);
  const onTile = (bg: StarterBackground) => (rotating(bg.group) ? setIncluded(bg, !isIncluded(bg)) : pick(bg.path));
  const tileLabel = (bg: StarterBackground, name: string) =>
    t(rotating(bg.group) ? 'backgroundPicker.includeInRotation' : 'backgroundPicker.useFixed', { name });

  // The theme the selected display paints its fullscreen modules with: its
  // own override first, then the shared default, then the shipped default.
  const themeInUse = getActiveFullscreenTheme(config, selectedDisplayId) ?? 'linen';
  const themeWalls = starterBackgroundsIn('theme');
  const orderedThemeWalls = [
    ...themeWalls.filter((bg) => bg.themeId === themeInUse),
    ...themeWalls.filter((bg) => bg.themeId !== themeInUse),
  ];
  const colorWalls = starterBackgroundsIn('color');
  const patternWalls = starterBackgroundsIn('pattern');

  const wallTile = (bg: StarterBackground) => {
    const name = t(`backgroundPicker.starters.${bg.id}`);
    const marked = isMarked(bg);
    return (
      <button
        key={bg.id}
        type="button"
        aria-label={tileLabel(bg, name)}
        aria-pressed={marked}
        onClick={() => onTile(bg)}
        title={name}
        data-testid={`starter-background-${bg.id}`}
        className={`relative block w-full overflow-hidden rounded border ${tileAspect} ${marked ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong'}`}
      >
        {/* The thumbnail is the wall's own file, so it cannot drift from what the display paints. */}
        <img src={bg.path} alt="" className="h-full w-full object-cover" />
        {marked && rotating(bg.group) && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-hs-accent text-white" aria-hidden="true">
            <Check size={10} />
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <SinglePhotoPicker
        selectedScreenId={selectedScreenId}
        onPickImage={pick}
        hasKey={{ unsplash: hasUnsplashKey, nasa: hasNasaKey, immich: hasImmichKey }}
      />

      <StarterGroup id="theme" title={t('backgroundPicker.groups.theme')} count="" checked={false}>
        <div className="grid grid-cols-2 gap-1.5">
          {orderedThemeWalls.map((bg) => {
            const theme = FULLSCREEN_THEMES.find((th) => th.id === bg.themeId);
            if (!theme) return null;
            const selected = isMarked(bg);
            const inUse = theme.id === themeInUse;
            const group = tOrFallback(t, `settings.defaultDisplayPage.themeGroups.${theme.group}`, theme.group);
            return (
              <button
                key={bg.id}
                type="button"
                aria-label={tileLabel(bg, theme.name)}
                aria-pressed={selected}
                onClick={() => onTile(bg)}
                data-testid={`starter-background-${bg.id}`}
                data-in-use={inUse ? 'true' : undefined}
                className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left transition-colors ${themeTileClass(selected)}`}
              >
                <FullscreenThemePreview tokens={theme.tokens} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-[10px] font-semibold ${selected ? 'text-hs-accent-hover' : 'text-hs-text-body'}`}>{theme.name}</div>
                  <div className="truncate text-[9px] text-hs-text-faint">
                    <span className="capitalize">{group}</span>
                    {inUse && <span> · {t('backgroundPicker.inUse')}</span>}
                  </div>
                </div>
                {selected && rotating(bg.group) && <Check size={11} className="shrink-0 text-hs-accent-hover" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </StarterGroup>

      <StarterGroup id="color" title={t('backgroundPicker.groups.color')} count={selectionCount('color')}
        hint={groupHint('color')} checked={selectedSources.includes('color')} onChange={(checked) => selectSource('color', checked)}>
        <div className={tileGrid}>
          <div>
            <button
              type="button"
              aria-pressed={!currentScreen.backgroundImage && !isRotationActive(currentScreen.backgroundRotation)}
              onClick={() => pick('')}
              data-testid="starter-background-none"
              className={`block w-full rounded border text-[10px] text-hs-text-faint ${tileAspect} ${
                !currentScreen.backgroundImage && !isRotationActive(currentScreen.backgroundRotation) ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong'
              }`}
            >
              {t('settings.localBackgrounds.none')}
            </button>
          </div>
          {colorWalls.map(wallTile)}
        </div>
      </StarterGroup>

      <StarterGroup id="pattern" title={t('backgroundPicker.groups.pattern')} count={selectionCount('pattern')}
        hint={groupHint('pattern')} checked={selectedSources.includes('pattern')} onChange={(checked) => selectSource('pattern', checked)}>
        <div className={tileGrid}>{patternWalls.map(wallTile)}</div>
      </StarterGroup>
    </>
  );
}
