'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import FullscreenThemePreview from '@/components/ui/FullscreenThemePreview';
import { themeTileClass } from '@/components/editor/settings/shared/FullscreenThemeTile';
import { useTranslate, tOrFallback } from '@/i18n';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { starterBackgroundsIn, type StarterBackground, type StarterBackgroundGroup } from '@/lib/starter-backgrounds';

const GROUP_STORAGE_PREFIX = 'hs-background-group-';

function readGroupOpen(id: string): boolean {
  try {
    return localStorage.getItem(GROUP_STORAGE_PREFIX + id) !== 'closed';
  } catch {
    return true;
  }
}

function StarterGroup({ id, title, count, children }: { id: StarterBackgroundGroup; title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
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
        type="button"
        onClick={toggle}
        aria-expanded={open}
        data-testid={`starter-group-${id}`}
        className="flex w-full items-center gap-1 py-1 text-[10px] text-hs-text-faint hover:text-hs-text-muted"
      >
        <Chevron size={11} />
        <span>{title}</span>
        <span className="ml-auto">{count}</span>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

/** Shipped wallpapers are offered only to the background picker, not to every image consumer. */
export default function StarterBackgroundCollection({ selectedPath, onPick, themeInUse, landscape }: {
  selectedPath: string;
  onPick: (path: string) => void;
  themeInUse: string;
  landscape: boolean;
}) {
  const t = useTranslate('editor');
  const themeWalls = starterBackgroundsIn('theme');
  const orderedThemeWalls = [
    ...themeWalls.filter((bg) => bg.themeId === themeInUse),
    ...themeWalls.filter((bg) => bg.themeId !== themeInUse),
  ];
  const colorWalls = starterBackgroundsIn('color');
  const patternWalls = starterBackgroundsIn('pattern');
  const tileAspect = landscape ? 'aspect-video' : 'aspect-[9/16]';
  const tileGrid = landscape ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-4 gap-1.5';

  const wallTile = (bg: StarterBackground) => {
    const name = t(`backgroundPicker.starters.${bg.id}`);
    const selected = selectedPath === bg.path;
    return (
      <div key={bg.id}>
        <button
          type="button"
          onClick={() => onPick(bg.path)}
          title={name}
          aria-label={name}
          aria-pressed={selected}
          data-testid={`starter-background-${bg.id}`}
          className={`block w-full overflow-hidden rounded border ${tileAspect} ${selected ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong'}`}
        >
          <img src={bg.path} alt="" loading="lazy" className="h-full w-full object-cover" />
        </button>
        <div className={`mt-0.5 truncate text-center text-[9px] leading-tight ${selected ? 'text-hs-accent-hover' : 'text-hs-text-muted'}`}>{name}</div>
      </div>
    );
  };

  return (
    <div data-testid="starter-background-collection" className="px-4 py-3">
      <StarterGroup id="theme" title={t('backgroundPicker.groups.theme')} count={themeWalls.length}>
        <div className="grid grid-cols-2 gap-1.5">
          {orderedThemeWalls.map((bg) => {
            const theme = FULLSCREEN_THEMES.find((th) => th.id === bg.themeId);
            if (!theme) return null;
            const selected = selectedPath === bg.path;
            const inUse = theme.id === themeInUse;
            const group = tOrFallback(t, `settings.defaultDisplayPage.themeGroups.${theme.group}`, theme.group);
            return (
              <button
                key={bg.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(bg.path)}
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
              onClick={() => onPick('')}
              aria-pressed={!selectedPath}
              data-testid="starter-background-none"
              className={`block w-full rounded border text-[10px] text-hs-text-faint ${tileAspect} ${!selectedPath ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong'}`}
            >
              {t('settings.localBackgrounds.none')}
            </button>
          </div>
          {colorWalls.map(wallTile)}
        </div>
      </StarterGroup>

      <StarterGroup id="pattern" title={t('backgroundPicker.groups.pattern')} count={patternWalls.length}>
        <div className={tileGrid}>{patternWalls.map(wallTile)}</div>
      </StarterGroup>
    </div>
  );
}
