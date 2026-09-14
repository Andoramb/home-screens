'use client';

import { useState } from 'react';
import { useImageLibrary } from '@/hooks/useImageLibrary';
import { libraryFileFromServeUrl } from '@/lib/library-client';
import { STARTER_DAY_ART, STARTER_DAY_ART_URL } from '@/lib/starter-day-art';
import { useTranslate } from '@/i18n';

/**
 * Picture picker for day-look rules: the art that ships with Home Screens,
 * plus this household's own uploads in the media library's calendar-art
 * folder. Stores a URL in `CalendarDayRule.backgroundImage`.
 */

const KEY = 'configSections.calendarRules';
const CALENDAR_ART_DIR = 'calendar-art';

type Tab = 'builtin' | 'yours';

/** The tab a value lives on: built-in paths on Built-in, everything else
 *  (a media-library serve URL) on Your pictures. */
function tabFor(value: string | undefined): Tab {
  return value && !value.startsWith(`${STARTER_DAY_ART_URL}/`) ? 'yours' : 'builtin';
}

/** A library path without the calendar-art folder prefix (the tab already
 *  says whose pictures they are). */
function displayName(url: string): string {
  const file = libraryFileFromServeUrl(url) ?? '';
  return file.startsWith(`${CALENDAR_ART_DIR}/`) ? file.slice(CALENDAR_ART_DIR.length + 1) : file;
}

export default function DayArtPicker({ value, onChange }: {
  value: string | undefined;
  onChange: (url: string | undefined) => void;
}) {
  const t = useTranslate('editor');
  // The tab follows the value (so undo, redo and a layout import land on
  // the tab holding the selection); a click overrides it only until the
  // next pick.
  const [tabOverride, setTabOverride] = useState<Tab | null>(null);
  const tab = tabOverride ?? tabFor(value);
  const pick = (url: string) => {
    setTabOverride(null);
    onChange(url);
  };

  const tabClass = (on: boolean) =>
    `flex-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${on ? 'border-hs-accent bg-hs-accent/20 text-hs-text-body' : 'border-hs-border-strong text-hs-text-muted hover:text-hs-text-body'}`;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-hs-border-strong/60 p-2" data-day-art-picker="">
      <div className="flex gap-1">
        <button type="button" aria-pressed={tab === 'builtin'} onClick={() => setTabOverride('builtin')} className={tabClass(tab === 'builtin')}>
          {t(`${KEY}.artTabBuiltin`)}
        </button>
        <button type="button" aria-pressed={tab === 'yours'} onClick={() => setTabOverride('yours')} className={tabClass(tab === 'yours')}>
          {t(`${KEY}.artTabYours`)}
        </button>
      </div>

      {tab === 'builtin' && (
        <div className="grid grid-cols-3 gap-1.5">
          {STARTER_DAY_ART.map((art) => (
            <button
              key={art.id}
              type="button"
              aria-label={t(`${KEY}.artNames.${art.id}`)}
              aria-pressed={value === art.path}
              onClick={() => pick(art.path)}
              className={`overflow-hidden rounded border ${value === art.path ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong hover:border-hs-text-faint'}`}
              data-art-option={art.id}
            >
              <span className="block h-10 bg-cover bg-center" style={{ backgroundImage: `url(${art.path})` }} />
              <span className="block truncate px-0.5 py-0.5 text-[10px] text-hs-text-muted">{t(`${KEY}.artNames.${art.id}`)}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'yours' && <YourPictures value={value} onPick={pick} />}
    </div>
  );
}

/**
 * The calendar-art folder through the same library hook the image browsers
 * use (listing, upload, cache invalidation for canvas previews). Mounted
 * only while its tab shows, so a rule card never lists the folder it is
 * not looking at, and switching tabs drops any stale upload error.
 */
function YourPictures({ value, onPick }: {
  value: string | undefined;
  onPick: (url: string) => void;
}) {
  const t = useTranslate('editor');
  const lib = useImageLibrary({ initialDirectory: CALENDAR_ART_DIR });
  const pictures = lib.items.filter((item) => item.type === 'image');

  return (
    <div className="flex flex-col gap-1.5">
      {/* Same tile shape as the Built-in grid, two per row instead of three;
       * the selected tile wears the accent border and ring so opening an
       * existing rule shows which picture it holds. */}
      <div className="grid grid-cols-2 gap-1.5">
        {pictures.map(({ url }) => {
          const selected = value === url;
          return (
            <button
              key={url}
              type="button"
              aria-pressed={selected}
              onClick={() => { lib.setError(null); onPick(url); }}
              className={`overflow-hidden rounded border ${selected ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong hover:border-hs-text-faint'}`}
              data-my-art=""
            >
              <span className="block h-14 bg-cover bg-center" style={{ backgroundImage: `url(${url})` }} />
              <span className={`block truncate px-0.5 py-0.5 text-[10px] ${selected ? 'text-hs-accent-hover' : 'text-hs-text-muted'}`}>{displayName(url)}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={lib.uploading}
        onClick={() => lib.fileInputRef.current?.click()}
        className="rounded border border-dashed border-hs-border-strong py-1.5 text-[11px] text-hs-text-muted hover:text-hs-text-body disabled:opacity-50"
        data-upload-art=""
      >
        {lib.uploading ? t(`${KEY}.artUploading`) : t(`${KEY}.artUpload`)}
      </button>
      <span className="text-[10px] text-hs-text-faint">{t(`${KEY}.artUploadHint`)}</span>
      {lib.error && <span className="text-[11px] text-hs-danger">{lib.error}</span>}
      <input
        ref={lib.fileInputRef}
        type="file"
        accept="image/*,.svg"
        className="hidden"
        onChange={async (e) => {
          const [first] = await lib.handleUpload(e);
          if (first) onPick(first);
        }}
      />
    </div>
  );
}
