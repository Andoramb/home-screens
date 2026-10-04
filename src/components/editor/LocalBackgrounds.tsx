'use client';

import { useState, useEffect, useId, type ReactNode } from 'react';
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
import { isRotationActive } from '@/lib/screen-background';

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

/** One collapsible heading in the shipped set. Open by default; the choice sticks per browser. */
function StarterGroup({ id, title, count, children }: { id: StarterBackgroundGroup; title: string; count: number; children: ReactNode }) {
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
    <div className="mt-2">
      <button
        id={`starter-group-${id}`}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={`starter-group-${id}`}
        className="flex w-full items-center gap-1 rounded border border-hs-border-strong bg-hs-card px-2 py-1.5 text-xs font-medium text-hs-text-body hover:bg-hs-hover"
      >
        <Chevron size={11} />
        <span>{title}</span>
        <span className="ml-auto">{count}</span>
      </button>
      {open && <div id={panelId} className="mt-1">{children}</div>}
    </div>
  );
}

export default function LocalBackgrounds({ selectedScreenId }: Props) {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, updateScreen } = useEditorStore();

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);

  if (!currentScreen || !config) return null;

  // Picking any background turns rotation off: a rotating screen would paint
  // over the choice within the hour, which reads as "it didn't save".
  const pick = (backgroundImage: string) => {
    const updates: Record<string, unknown> = { backgroundImage };
    if (isRotationActive(currentScreen?.backgroundRotation)) {
      updates.backgroundRotation = { ...currentScreen.backgroundRotation, enabled: false, sources: [] };
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
      <div key={bg.id}>
        <button
          type="button"
          aria-label={name}
          aria-pressed={isCurrent(bg.path) && !isRotationActive(currentScreen.backgroundRotation)}
          onClick={() => pick(bg.path)}
          title={name}
          data-testid={`starter-background-${bg.id}`}
          className={`block w-full overflow-hidden rounded border ${tileAspect} ${tileBorder(bg.path)}`}
        >
          {/* The thumbnail is the wall's own file, so it cannot drift from what the display paints. */}
          <img src={bg.path} alt="" className="h-full w-full object-cover" />
        </button>
        <div className={`mt-0.5 truncate text-center text-[9px] leading-tight ${isCurrent(bg.path) && !isRotationActive(currentScreen.backgroundRotation) ? 'text-hs-accent-hover' : 'text-hs-text-muted'}`}>
          {name}
        </div>
      </div>
    );
  };

  return (
    <>
      <StarterGroup id="theme" title={t('backgroundPicker.groups.theme')} count={themeWalls.length}>
        <div className="grid grid-cols-2 gap-1.5">
          {orderedThemeWalls.map((bg) => {
            const theme = FULLSCREEN_THEMES.find((th) => th.id === bg.themeId);
            if (!theme) return null;
            const selected = isCurrent(bg.path) && !isRotationActive(currentScreen.backgroundRotation);
            const inUse = theme.id === themeInUse;
            const group = tOrFallback(t, `settings.defaultDisplayPage.themeGroups.${theme.group}`, theme.group);
            return (
              <button
                key={bg.id}
                type="button"
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
            );
          })}
        </div>
      </StarterGroup>

      <StarterGroup id="color" title={t('backgroundPicker.groups.color')} count={colorWalls.length}>
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

      <StarterGroup id="pattern" title={t('backgroundPicker.groups.pattern')} count={patternWalls.length}>
        <div className={tileGrid}>{patternWalls.map(wallTile)}</div>
      </StarterGroup>
    </>
  );
}
