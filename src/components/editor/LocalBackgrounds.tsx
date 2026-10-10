'use client';

import { useState, useEffect, useId } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
}

const GROUP_STORAGE_PREFIX = 'hs-background-group-';

function readGroupOpen(id: string): boolean {
  try {
    return localStorage.getItem(GROUP_STORAGE_PREFIX + id) !== 'closed';
  } catch {
    return true;
  }
}

/** Heading doubles as the source checkbox; the tile settings expand only when enabled. */
function StarterGroup({ id, title, count, checked, onChange, children }: {
  id: StarterBackgroundGroup; title: string; count: string; checked: boolean;
  onChange: (checked: boolean) => void; children: React.ReactNode;
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
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-hs-text-body">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-hs-border-strong" />
          <span>{title}</span>
        </label>
        {checked && (
          <button id={`starter-group-${id}`} type="button" onClick={toggle} aria-expanded={open}
            aria-controls={panelId} data-testid={`starter-group-${id}`}
            aria-label={`${title} ${count}`} className="flex items-center gap-1 rounded px-1 text-[10px] text-hs-text-muted hover:bg-hs-hover">
            <span>{count}</span><Chevron size={11} aria-hidden="true" />
          </button>
        )}
      </div>
      {checked && open && <div id={panelId} className="ml-5 space-y-1.5">{children}</div>}
    </div>
  );
}

export default function LocalBackgrounds({ selectedScreenId }: Props) {
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
  // An absent or empty list means the whole group, not an empty rotation.
  const selections = rotation?.starterBackgroundIds;
  const selectedIds = (group: StarterBackgroundGroup) => {
    const catalog = starterBackgroundsIn(group);
    const ids = selections?.[group];
    return ids?.length ? catalog.filter((wall) => ids.includes(wall.id)).map((wall) => wall.id) : catalog.map((wall) => wall.id);
  };
  const setIncluded = (bg: StarterBackground, include: boolean) => {
    const group = bg.group;
    const ids = selectedIds(group);
    const next = include ? [...ids, bg.id] : ids.filter((id) => id !== bg.id);
    // Excluding the last wall cannot persist as []: [] means all by contract.
    if (!next.length) return;
    const catalog = starterBackgroundsIn(group);
    updateScreenRotation(selectedScreenId, {
      starterBackgroundIds: { ...selections, [group]: next.length === catalog.length ? [] : next },
    });
  };
  const selectionCount = (group: StarterBackgroundGroup) => `${selectedIds(group).length}/${starterBackgroundsIn(group).length}`;

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
  const tileBorder = (path: string) => (isCurrent(path) && !isRotationActive(currentScreen.backgroundRotation) ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong');

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
    return (
      <div key={bg.id} className="relative">
        <button
          type="button"
          aria-label={t('backgroundPicker.useFixed', { name })}
          aria-pressed={isCurrent(bg.path) && !isRotationActive(currentScreen.backgroundRotation)}
          onClick={() => pick(bg.path)}
          title={name}
          data-testid={`starter-background-${bg.id}`}
          className={`block w-full overflow-hidden rounded border ${tileAspect} ${tileBorder(bg.path)}`}
        >
          {/* The thumbnail is the wall's own file, so it cannot drift from what the display paints. */}
          <img src={bg.path} alt="" className="h-full w-full object-cover" />
        </button>
        <label className="mt-0.5 flex items-center justify-center gap-1 truncate text-[9px] leading-tight">
          <input type="checkbox" aria-label={t('backgroundPicker.includeInRotation', { name })}
            checked={isIncluded(bg)} disabled={selectedIds(bg.group).length === 1 && isIncluded(bg)}
            onChange={(e) => setIncluded(bg, e.target.checked)} />
          <span className={`truncate ${isCurrent(bg.path) && !isRotationActive(currentScreen.backgroundRotation) ? 'text-hs-accent-hover' : 'text-hs-text-muted'}`}>
            {name}
          </span>
        </label>
      </div>
    );
  };

  return (
    <>
      <StarterGroup id="theme" title={t('backgroundPicker.groups.theme')} count={selectionCount('theme')}
        checked={selectedSources.includes('theme')} onChange={(checked) => selectSource('theme', checked)}>
        <div className="grid grid-cols-2 gap-1.5">
          {orderedThemeWalls.map((bg) => {
            const theme = FULLSCREEN_THEMES.find((th) => th.id === bg.themeId);
            if (!theme) return null;
            const selected = isCurrent(bg.path) && !isRotationActive(currentScreen.backgroundRotation);
            const inUse = theme.id === themeInUse;
            const group = tOrFallback(t, `settings.defaultDisplayPage.themeGroups.${theme.group}`, theme.group);
            return (
              <div key={bg.id} className="min-w-0">
                <button
                  type="button"
                  aria-label={t('backgroundPicker.useFixed', { name: theme.name })}
                  aria-pressed={selected}
                  onClick={() => pick(bg.path)}
                  data-testid={`starter-background-${bg.id}`}
                  data-in-use={inUse ? 'true' : undefined}
                  className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left transition-colors ${themeTileClass(selected)}`}
                >
                  <FullscreenThemePreview tokens={theme.tokens} size="sm" />
                  <div className="min-w-0">
                    <div className={`truncate text-[10px] font-semibold ${selected ? 'text-hs-accent-hover' : 'text-hs-text-body'}`}>{theme.name}</div>
                    <div className="truncate text-[9px] text-hs-text-faint">
                      <span className="capitalize">{group}</span>
                      {inUse && <span> · {t('backgroundPicker.inUse')}</span>}
                    </div>
                  </div>
                </button>
                <label className="mt-0.5 flex items-center justify-center gap-1 text-[9px] text-hs-text-muted">
                  <input type="checkbox" aria-label={t('backgroundPicker.includeInRotation', { name: theme.name })}
                    checked={isIncluded(bg)} disabled={selectedIds('theme').length === 1 && isIncluded(bg)}
                    onChange={(e) => setIncluded(bg, e.target.checked)} />
                  {t('backgroundPicker.inRotation')}
                </label>
              </div>
            );
          })}
        </div>
      </StarterGroup>

      <StarterGroup id="color" title={t('backgroundPicker.groups.color')} count={selectionCount('color')}
        checked={selectedSources.includes('color')} onChange={(checked) => selectSource('color', checked)}>
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
            <div className="mt-0.5 text-[9px] leading-tight">&nbsp;</div>
          </div>
          {colorWalls.map(wallTile)}
        </div>
      </StarterGroup>

      <StarterGroup id="pattern" title={t('backgroundPicker.groups.pattern')} count={selectionCount('pattern')}
        checked={selectedSources.includes('pattern')} onChange={(checked) => selectSource('pattern', checked)}>
        <div className={tileGrid}>{patternWalls.map(wallTile)}</div>
      </StarterGroup>
    </>
  );
}
