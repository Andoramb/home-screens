// @vitest-environment jsdom

/**
 * What the slideshow panel's Google Photos import says when it finishes: one
 * count-aware sentence for what was saved and one for what was already in
 * the library, so a single photo never reads "Saved 1 new photos".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { displayCache } from '@/lib/display-cache';
import enUSEditor from '@/translations/en-US/editor.json';

const editorFetch = vi.fn();
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (...args: unknown[]) => editorFetch(...args),
  isSessionExpired: () => false,
}));

import { GooglePhotosImportSection } from '../GooglePhotosImportSection';

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>{children}</I18nProvider>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Finished { total: number; done: number; skipped: number; failed: number }

/** The hub for one picking session whose picks are in at once, and whose import ends as `job`. */
function hubAnswers(job: Finished) {
  editorFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === '/api/google-picker/status') return jsonResponse({ connected: true, credentialsConfigured: true });
    if (url === '/api/google-picker/session' && init?.method === 'POST') {
      return jsonResponse({ id: 'sess-1', pickerUri: 'https://photos.google.com/picker/sess-1', pollIntervalMs: 1000 });
    }
    if (url.startsWith('/api/google-picker/session?')) return jsonResponse({ mediaItemsSet: true });
    if (url === '/api/google-picker/import' && init?.method === 'POST') return jsonResponse({ jobId: 'job-1', total: job.total }, 202);
    if (url.startsWith('/api/google-picker/import?')) return jsonResponse({ state: 'done', ...job, videoFiles: [] });
    throw new Error(`unexpected request ${url}`);
  });
}

/** Opens the section, picks, and lets the import finish as `job`. */
async function importPicks(job: Finished) {
  hubAnswers(job);
  vi.spyOn(window, 'open').mockReturnValue(null);
  const onImported = vi.fn();
  const view = render(<GooglePhotosImportSection onImported={onImported} />, { wrapper: Wrapper });
  fireEvent.click(view.getByText('Import from Google Photos'));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // status
  fireEvent.click(view.getByText('Choose photos'));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // session opens
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); // picks are in, import starts
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); // import finishes
  return { view, onImported };
}

beforeEach(() => {
  vi.useFakeTimers();
  editorFetch.mockReset();
  displayCache.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe('GooglePhotosImportSection when an import finishes', () => {
  it('says one new photo in the singular, and points the slideshow at the photos', async () => {
    const { view, onImported } = await importPicks({ total: 1, done: 1, skipped: 0, failed: 0 });
    expect(view.getByText('Saved 1 new photo to your library.')).toBeTruthy();
    expect(onImported).toHaveBeenCalledWith('google-photos');
  });

  it('says what was saved and what was already there, each in its own sentence', async () => {
    const { view } = await importPicks({ total: 3, done: 2, skipped: 1, failed: 0 });
    expect(view.getByText('Saved 2 new photos to your library. 1 was already in your library.')).toBeTruthy();
  });

  it('says only what was already there when nothing was new', async () => {
    const { view } = await importPicks({ total: 2, done: 0, skipped: 2, failed: 0 });
    expect(view.getByText('2 were already in your library.')).toBeTruthy();
    expect(view.queryByText(/Saved 0/)).toBeNull();
  });
});
