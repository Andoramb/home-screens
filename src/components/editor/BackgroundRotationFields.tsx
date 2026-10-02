'use client';

import { useState, useEffect, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import type { BackgroundRotation } from '@/types/config';
import Button from '@/components/ui/Button';
import ImageBrowserModal from './ImageBrowserModal';
import { Plus, X } from 'lucide-react';
import AccordionSection from './AccordionSection';
import { useTranslate } from '@/i18n';

interface ImmichAlbumOption { id: string; name: string; assetCount: number }
interface ImmichPersonOption { id: string; name: string }

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

export function ImmichRotationFields({ rotation, onChange }: {
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
      <AccordionSection title={t('backgroundPicker.immich.albumLabel')} defaultOpen={false} badge={albumIds.length || undefined}>
        <CheckboxOptionList
          options={albums.map((a) => ({ id: a.id, label: t('backgroundPicker.immich.albumOption', { name: a.name, count: a.assetCount }) }))}
          selected={albumIds}
          onToggle={(id, checked) => toggleIn('immichAlbumIds', albumIds, id, checked)}
          emptyLabel={t('backgroundPicker.immich.noAlbums')}
        />
        <span className="block text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.anyAlbum')}</span>
      </AccordionSection>
      <AccordionSection title={t('backgroundPicker.immich.personPlusLabel')} defaultOpen={false} badge={personIds.length || undefined}>
        <CheckboxOptionList
          options={personOptions}
          selected={personIds}
          onToggle={(id, checked) => toggleIn('immichPersonIds', personIds, id, checked)}
          emptyLabel={t('backgroundPicker.immich.noPeople')}
        />
        <span className="block text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.personPlusHint')}</span>
      </AccordionSection>
      <AccordionSection title={t('backgroundPicker.immich.personMinusLabel')} defaultOpen={false} badge={personIdsExclude.length || undefined}>
        <CheckboxOptionList
          options={personOptions}
          selected={personIdsExclude}
          onToggle={(id, checked) => toggleIn('immichPersonIdsExclude', personIdsExclude, id, checked)}
          emptyLabel={t('backgroundPicker.immich.noPeople')}
        />
        <span className="block text-[10px] text-hs-text-faint">{t('backgroundPicker.immich.personMinusHint')}</span>
      </AccordionSection>
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

export function LocalRotationFields({ folder, onChange }: {
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

export function CollectionsRotationFields({ collections, onChange }: {
  collections: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslate('editor');
  const [validations, setValidations] = useState<Record<number, CollectionValidation>>({});
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
