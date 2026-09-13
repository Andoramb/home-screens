'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import { useConfirmStore } from '@/stores/confirm-store';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import type { MediaInventory, MediaInventoryItem } from '@/lib/media-inventory';
import type { MediaUseKind } from '@/lib/media-usage';
import { logger } from '@/lib/logger';

const log = logger('media-library');

/** Folder a file sits directly in: '' for the library's top level. */
function folderOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

const KNOWN_USE_KINDS: ReadonlySet<string> = new Set<MediaUseKind>([
  'screen', 'dayRule', 'module', 'other',
]);

/**
 * Human file size, 1 KB = 1000 B. One decimal while the value is under ten of
 * a unit, integers above — the convention phone galleries use, so "4.8 MB"
 * stays precise but 112 MB doesn't pretend to be 112.0.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${units[unit]}`;
}

type KindFilter = 'all' | 'image' | 'video';
const KIND_LABELS: Record<KindFilter, string> = {
  all: 'settings.mediaPage.allKinds',
  image: 'settings.mediaPage.images',
  video: 'settings.mediaPage.videos',
};

/** One "where is this used?" line: the usage kind, with the name folded in
 *  when the scanner found one. Without a name the raw template's `{name}`
 *  would leak, so the plain key runs without vars instead. Kinds outside the
 *  scanner's four (a future config shape, a hand-edited payload) read as the
 *  generic "somewhere in settings" label rather than a missing-key path. */
function usageLabel(
  t: ReturnType<typeof useTranslate>,
  use: { kind: string; name?: string },
): string {
  const kind = KNOWN_USE_KINDS.has(use.kind) ? use.kind : 'other';
  return use.name
    ? t(`settings.mediaPage.kind.${kind}`, { name: use.name })
    : t(`settings.mediaPage.kind.${kind}`);
}

export default function MediaLibraryPage() {
  const t = useTranslate('editor');
  const [inventory, setInventory] = useState<MediaInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [folder, setFolder] = useState<string>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refused, setRefused] = useState<string[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDir, setUploadDir] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mount + supersede guards, mirroring MealsSection's persist pattern: an
  // inventory response only lands if its request is still the latest one AND
  // the page is still mounted, so an upload's refresh cannot be overwritten by
  // a delete's slower stale response (or fire setState after navigation away).
  const refreshReqIdRef = useRef(0);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const myReqId = ++refreshReqIdRef.current;
    setLoading(true);
    try {
      const res = await editorFetch('/api/backgrounds/inventory');
      if (!isMountedRef.current || myReqId !== refreshReqIdRef.current) return;
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      setInventory((await res.json()) as MediaInventory);
      setLoadFailed(false);
    } catch (err) {
      if (!isMountedRef.current || myReqId !== refreshReqIdRef.current) return;
      log.debug('Failed to load media inventory:', err);
      setLoadFailed(true);
    } finally {
      if (isMountedRef.current && myReqId === refreshReqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = inventory?.items ?? [];
  const uses = inventory?.usage ?? {};
  const matches = (item: MediaInventoryItem) =>
    (folder === 'all' || folderOf(item.path) === folder)
    && (kind === 'all' || item.kind === kind);
  const visible = items.filter(matches);
  const countIn = (f: string) => items.filter(
    (item) => (f === 'all' || folderOf(item.path) === f) && (kind === 'all' || item.kind === kind),
  ).length;

  const toggle = (path: string, locked: boolean) => {
    if (locked || busy) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const uploadFiles = useCallback(async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    // Reset the picker synchronously — the File objects are already captured —
    // so re-picking the same file later fires a change event even when the
    // early return below skips the upload.
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0 || busy) return;
    setBusy(true);
    setUploadError(null);
    const formData = new FormData();
    for (const file of files) formData.append('file', file);
    if (uploadDir) formData.append('directory', uploadDir);
    try {
      const res = await editorFetch('/api/backgrounds', { method: 'POST', body: formData });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setUploadError(
          data.error ?? t('settings.mediaPage.uploadFailedWithStatus', { status: res.status }),
        );
        return;
      }
      setUploadOpen(false);
      // Back to the unfiltered view so freshly uploaded files are on screen
      // instead of hidden behind a filter that predates them.
      setFolder('all');
      setKind('all');
      await refresh();
    } catch (err) {
      if (!isSessionExpired(err)) {
        setUploadError(err instanceof Error ? err.message : t('settings.mediaPage.uploadFailed'));
      }
    } finally {
      setBusy(false);
    }
  }, [busy, uploadDir, refresh, t]);

  const handleDelete = async () => {
    const paths = [...selected];
    if (paths.length === 0 || busy) return;
    const confirmed = await useConfirmStore.getState().confirm({
      title: t('settings.mediaPage.deleteTitle', { count: paths.length }),
      message: t('settings.mediaPage.deleteMessage'),
      confirmLabel: t('settings.mediaPage.deleteConfirm'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setBusy(true);
    const refusedNow: string[] = [];
    for (const path of paths) {
      const idx = path.lastIndexOf('/');
      const file = idx === -1 ? path : path.slice(idx + 1);
      const directory = idx === -1 ? undefined : path.slice(0, idx);
      try {
        const res = await editorFetch('/api/backgrounds', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(directory ? { file, directory } : { file }),
        });
        // 409: the config picked the file up since the page loaded. 404:
        // it is already gone, which is what was wanted anyway.
        if (res.status === 409) refusedNow.push(file);
      } catch (err) {
        log.debug('Failed to delete background:', err);
      }
    }
    setSelected(new Set());
    setRefused(refusedNow);
    await refresh();
    // Busy clears only after the post-delete refresh settles, so no upload can
    // slip a refresh into the gap and have the delete's slower response
    // superseded (or the buttons un-disable early).
    setBusy(false);
  };

  const chipClass = (on: boolean) => clsx(
    'rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors',
    on
      ? 'border-hs-accent bg-hs-accent/20 text-hs-text-body'
      : 'border-hs-border-strong text-hs-text-muted hover:text-hs-text-body',
  );

  const directories = inventory?.directories ?? [];

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setUploadOpen((open) => !open)}
          disabled={busy}
          data-testid="media-upload-button"
        >
          {t('settings.mediaPage.upload')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => void handleDelete()}
          disabled={selected.size === 0 || busy}
          data-testid="media-delete-button"
        >
          {t('settings.mediaPage.deleteConfirm')}
        </Button>
        <span className="ml-auto text-xs text-hs-text-muted" data-testid="media-selected-count">
          {selected.size > 0 ? t('settings.mediaPage.selected', { count: selected.size }) : ''}
        </span>
      </div>

      {loadFailed && (
        <div
          className="mb-3 flex items-center gap-2.5 text-xs text-hs-danger"
          data-testid="media-load-error"
        >
          <span>{t('settings.mediaPage.loadFailed')}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="font-semibold text-hs-accent hover:underline disabled:opacity-50"
            data-testid="media-retry-button"
          >
            {t('settings.mediaPage.tryAgain')}
          </button>
        </div>
      )}

      {uploadOpen && (
        <div
          className="mb-4 flex flex-col gap-2.5 rounded-[10px] border border-hs-border-strong bg-hs-card p-3"
          data-testid="media-upload-panel"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              void uploadFiles(e.dataTransfer.files);
            }}
            data-dropzone=""
            className={clsx(
              'rounded-lg border-[1.5px] border-dashed px-2.5 py-[22px] text-center text-xs',
              dragActive
                ? 'border-hs-accent bg-hs-accent/10 text-hs-text-body'
                : 'border-hs-border-strong text-hs-text-muted',
            )}
          >
            {t('settings.mediaPage.dropzone')}
          </button>
          <label className="flex items-center gap-2 text-xs text-hs-text-muted">
            {t('settings.mediaPage.saveInto')}
            <select
              value={uploadDir}
              onChange={(e) => setUploadDir(e.target.value)}
              data-upload-directory=""
              className="rounded-lg border border-hs-border-strong bg-hs-input px-2.5 py-1.5 text-xs text-hs-text-body"
            >
              <option value="">{t('settings.mediaPage.topLevel')}</option>
              {directories.map((d) => (
                <option key={d.path} value={d.path}>{d.name}</option>
              ))}
            </select>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/mp4,video/webm,video/quicktime"
            onChange={(e) => void uploadFiles(e.target.files)}
            data-file-input=""
            className="hidden"
          />
          {uploadError && (
            <p className="text-xs text-hs-danger" data-testid="media-upload-error">{uploadError}</p>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={folder === 'all'}
            onClick={() => setFolder('all')}
            data-testid="media-chip-all"
            className={chipClass(folder === 'all')}
          >
            {t('settings.mediaPage.allFolders')}
            <span className="ml-1 font-medium text-hs-text-faint" data-count="">{countIn('all')}</span>
          </button>
          <button
            type="button"
            aria-pressed={folder === ''}
            onClick={() => setFolder('')}
            data-testid="media-chip-root"
            className={chipClass(folder === '')}
          >
            {t('settings.mediaPage.topLevel')}
            <span className="ml-1 font-medium text-hs-text-faint" data-count="">{countIn('')}</span>
          </button>
          {directories.map((d) => (
            <button
              key={d.path}
              type="button"
              aria-pressed={folder === d.path}
              onClick={() => setFolder(d.path)}
              data-testid={`media-chip-${d.path}`}
              className={chipClass(folder === d.path)}
            >
              {d.name}
              <span className="ml-1 font-medium text-hs-text-faint" data-count="">{countIn(d.path)}</span>
            </button>
          ))}
        </div>
        <div
          className="ml-auto flex overflow-hidden rounded-full border border-hs-border-strong"
          role="group"
        >
          {(['all', 'image', 'video'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              data-testid={`media-kind-${k}`}
              className={clsx(
                'px-3 py-1 text-[11.5px] font-semibold transition-colors',
                kind === k ? 'bg-hs-accent/20 text-hs-text-body' : 'text-hs-text-muted',
              )}
            >
              {t(KIND_LABELS[k])}
            </button>
          ))}
        </div>
      </div>

      {refused.length > 0 && (
        <div className="mb-3 flex flex-col gap-1" data-testid="media-refused">
          {refused.map((file) => (
            <p key={file} className="text-xs text-hs-danger">
              {t('settings.mediaPage.refused', { file })}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5">
        {visible.map((item) => {
          const name = item.path.slice(item.path.lastIndexOf('/') + 1);
          const itemUses = uses[item.path] ?? [];
          const isUsed = itemUses.length > 0;
          const isSelected = selected.has(item.path);
          return (
            <div
              key={item.path}
              data-media-path={item.path}
              data-testid={`media-tile-${item.path}`}
              data-selected={isSelected ? 'true' : undefined}
              onClick={() => toggle(item.path, isUsed)}
              className={clsx(
                'group relative rounded-[10px] border bg-hs-card',
                isUsed ? 'cursor-not-allowed' : 'cursor-pointer',
                isSelected ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong',
              )}
            >
              {item.kind === 'video' ? (
                <div
                  className="flex aspect-[4/3] w-full items-center justify-center rounded-t-[9px] bg-[linear-gradient(135deg,#1a2233,#10141d)]"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-[34px] w-[34px] text-hs-text-primary opacity-85">
                    <path d="M8 5.5v13l11-6.5z" />
                  </svg>
                </div>
              ) : (
                <div
                  className="aspect-[4/3] w-full rounded-t-[9px] bg-hs-input bg-cover bg-center"
                  style={{ backgroundImage: `url('/api/backgrounds/serve?file=${encodeURIComponent(item.path)}')` }}
                  role="img"
                  aria-label={name}
                />
              )}
              <div className="flex flex-col gap-px px-2 py-1.5">
                <span className="truncate text-[11.5px] font-semibold text-hs-text-body">{name}</span>
                <span className="truncate text-[10.5px] text-hs-text-muted">
                  {item.width != null && item.height != null && `${item.width}×${item.height} · `}
                  <span className="font-semibold">{formatBytes(item.bytes)}</span>
                </span>
              </div>
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isUsed}
                aria-label={name}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(item.path, isUsed)}
                className="absolute left-[7px] top-[7px] h-4 w-4 cursor-pointer accent-[var(--hs-accent)]"
              />
              {isUsed && (
                <>
                  <span
                    data-in-use=""
                    title={itemUses.map((use) => usageLabel(t, use)).join(', ')}
                    className="absolute right-[7px] top-[7px] rounded-full border border-hs-warning/40 bg-hs-warning/15 px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-wide text-hs-warning"
                  >
                    {t('settings.mediaPage.inUse')}
                  </span>
                  {/* The tile deliberately has no overflow clipping so this
                      popover can reach past its bottom edge. */}
                  <div
                    data-used-by=""
                    className="absolute right-1.5 top-[calc(100%-2px)] z-10 hidden w-[190px] rounded-lg border border-hs-border-strong bg-hs-card p-2 shadow-xl group-hover:block"
                  >
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-hs-text-faint">
                      {t('settings.mediaPage.usedBy')}
                    </div>
                    <div className="text-[11px] leading-relaxed text-hs-text-muted">
                      {itemUses.map((use, i) => (
                        <div key={`${use.configPath}-${i}`}>{usageLabel(t, use)}</div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {!loading && !loadFailed && visible.length === 0 && (
        <p className="text-sm text-hs-text-faint" data-testid="media-empty">
          {t('settings.mediaPage.empty')}
        </p>
      )}
    </div>
  );
}
