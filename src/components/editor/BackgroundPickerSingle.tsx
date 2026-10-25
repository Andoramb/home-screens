'use client';

/**
 * Sources mode "Single": the original background picker. One fixed picture,
 * chosen from four tabs (Backgrounds, Unsplash, NASA, Immich). Picking saves
 * `backgroundImage` and, with `sourcesMode: 'single'`, never rotates. The
 * auto-rotate controls of the original live in Multiple.
 */
import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import LocalBackgroundsFixed from './LocalBackgroundsFixed';
import UnsplashBrowser from './UnsplashBrowser';
import NasaBrowser from './NasaBrowser';
import ImmichBrowser from './ImmichBrowser';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';

export default function BackgroundPickerSingle({ selectedScreenId }: { selectedScreenId: string }) {
  const t = useTranslate('editor');
  // Opens on the backgrounds that ship with Home Screens: the only tab that
  // always has something in it, no API key needed.
  const [tab, setTab] = useState<'unsplash' | 'nasa' | 'immich' | 'local'>('local');
  const { config, selectedDisplayId, updateScreen } = useEditorStore();
  const { status: secretStatus } = useSecretStatus();
  const hasUnsplashKey = !!secretStatus.unsplash_access_key;
  const hasNasaKey = !!secretStatus.nasa_api_key;
  const hasImmichKey = !!secretStatus.immich_api_key && !!secretStatus.immich_url;

  const currentScreen = (config ? getActiveScreens(config, selectedDisplayId) : []).find((s) => s.id === selectedScreenId);

  // Is the screen's own background file still on the hub? Only local paths are
  // checked (a remote URL cannot be HEAD-checked without CORS trouble).
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

  if (!currentScreen) return null;

  return (
    <>
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

      {/* Two rows rather than one scrolling row: four tabs do not fit across a
          288px panel. Tabs that need a key carry a lock until it is set up. */}
      <div className="grid grid-cols-2 gap-1 rounded-md bg-hs-card p-0.5">
        {([
          { id: 'local' as const, label: t('backgroundPicker.tabs.local'), locked: false },
          { id: 'unsplash' as const, label: 'Unsplash', locked: !hasUnsplashKey },
          { id: 'nasa' as const, label: t('backgroundPicker.tabs.nasa'), locked: !hasNasaKey },
          { id: 'immich' as const, label: 'Immich', locked: !hasImmichKey },
        ]).map((entry) => (
          <button
            key={entry.id}
            type="button"
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

      {/* A floor so switching to a short tab does not collapse the panel and jump the scroll. */}
      <div className="min-h-96">
        {tab === 'unsplash' && <UnsplashBrowser selectedScreenId={selectedScreenId} hasUnsplashKey={hasUnsplashKey} />}
        {tab === 'nasa' && <NasaBrowser selectedScreenId={selectedScreenId} hasNasaKey={hasNasaKey} />}
        {tab === 'immich' && <ImmichBrowser selectedScreenId={selectedScreenId} hasImmichKey={hasImmichKey} />}
        {tab === 'local' && <LocalBackgroundsFixed selectedScreenId={selectedScreenId} />}
      </div>
    </>
  );
}
