// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteLibraryFile, deleteLibraryImage, uploadLibraryFile, usageNames } from '@/lib/library-client';
import { isSessionExpired } from '@/lib/editor-fetch';

/**
 * Tests for the shared library-delete helper used by the editor's
 * `useImageLibrary`, the /remote Photos tab and the Pictures & videos page.
 * The interesting parts are the serve-URL parsing (the `file` query param is
 * a library-relative path whose directory/basename split becomes the DELETE
 * body) and folding the server's answer into one typed result, so an
 * in-use refusal reaches every surface with its where-used list.
 */

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentBody(): { file: string; directory?: string } {
  const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string);
}

describe('deleteLibraryImage', () => {
  it('splits a nested path into directory and basename', async () => {
    const res = await deleteLibraryImage('/api/backgrounds/serve?file=vacation%2F2026%2Fbeach.jpg');

    expect(res?.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/backgrounds');
    expect(init.method).toBe('DELETE');
    expect(sentBody()).toEqual({ file: 'beach.jpg', directory: 'vacation/2026' });
  });

  it('omits directory for a root-level file', async () => {
    await deleteLibraryImage('/api/backgrounds/serve?file=beach.jpg');

    expect(sentBody()).toEqual({ file: 'beach.jpg' });
    expect('directory' in sentBody()).toBe(false);
  });

  it('returns null without a request when the URL has no file param', async () => {
    const res = await deleteLibraryImage('/api/backgrounds/serve');

    expect(res).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a plain failure with its status and no usage', async () => {
    mockFetch.mockResolvedValue(new Response('nope', { status: 500 }));

    const res = await deleteLibraryImage('/api/backgrounds/serve?file=beach.jpg');

    expect(res).toEqual({ ok: false, status: 500, usage: [] });
  });
});

describe('deleteLibraryFile', () => {
  it('folds a 409 into the where-used list the server sent', async () => {
    const usage = [{ kind: 'screen', name: 'Hall', configPath: 'screens[0].backgroundImage' }];
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'in use', usage }), { status: 409 }));

    const res = await deleteLibraryFile('nature/a.jpg');

    expect(res).toEqual({ ok: false, status: 409, usage });
    expect(sentBody()).toEqual({ file: 'a.jpg', directory: 'nature' });
  });

  it('treats a 409 without a usable body as refused with no detail', async () => {
    mockFetch.mockResolvedValue(new Response('not json', { status: 409 }));

    const res = await deleteLibraryFile('a.jpg');

    expect(res).toEqual({ ok: false, status: 409, usage: [] });
  });

  it('counts an already-missing file as deleted', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 404 }));

    const res = await deleteLibraryFile('a.jpg');

    expect(res.ok).toBe(true);
  });
});

describe('usageNames', () => {
  it('lists each name once and skips uses without one', () => {
    expect(usageNames([
      { kind: 'screen', name: 'Hall', configPath: 'a' },
      { kind: 'module', name: 'Hall', configPath: 'b' },
      { kind: 'dayRule', configPath: 'c' },
      { kind: 'slideshow', name: 'Den', configPath: 'd' },
    ])).toEqual(['Hall', 'Den']);
  });
});

describe('uploadLibraryFile', () => {
  type Progress = { lengthComputable: boolean; loaded: number; total: number };

  /** Stands in for XMLHttpRequest: records what was sent and lets a test answer. */
  class FakeXhr {
    static sent: FakeXhr[] = [];
    method = '';
    url = '';
    body: FormData | null = null;
    status = 0;
    responseText = '';
    upload: { onprogress: ((e: Progress) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }

    send(body: FormData) {
      this.body = body;
      FakeXhr.sent.push(this);
    }

    answer(status: number, responseText: string) {
      this.status = status;
      this.responseText = responseText;
      this.onload?.();
    }
  }

  const photo = () => new File(['jpeg bytes'], 'a.jpg', { type: 'image/jpeg' });
  const lastSent = () => FakeXhr.sent[FakeXhr.sent.length - 1];
  let place: { pathname: string; search: string; href: string };

  beforeEach(() => {
    FakeXhr.sent = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    place = { pathname: '/remote', search: '?tab=photos', href: 'http://localhost:3000/remote?tab=photos' };
    vi.stubGlobal('location', place);
  });

  it('posts a form holding the file and its folder', async () => {
    const file = photo();
    const pending = uploadLibraryFile(file, 'Favorites');

    const xhr = lastSent();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/backgrounds');
    expect(xhr.body!.get('file')).toBe(file);
    expect(xhr.body!.get('directory')).toBe('Favorites');
    xhr.answer(201, '{}');
    await pending;
  });

  it('leaves the folder out for the top level', async () => {
    const pending = uploadLibraryFile(photo(), '');

    expect(lastSent().body!.has('file')).toBe(true);
    expect(lastSent().body!.has('directory')).toBe(false);
    lastSent().answer(201, '{}');
    await pending;
  });

  it('reports bytes sent only for progress that knows the total', async () => {
    const onProgress = vi.fn();
    const pending = uploadLibraryFile(photo(), 'Favorites', onProgress);
    const report = lastSent().upload.onprogress!;

    report({ lengthComputable: true, loaded: 100, total: 400 });
    report({ lengthComputable: false, loaded: 200, total: 0 });
    report({ lengthComputable: true, loaded: 400, total: 400 });

    expect(onProgress.mock.calls).toEqual([[100, 400], [400, 400]]);
    lastSent().answer(201, '{}');
    await pending;
  });

  it('hands back the stored file\'s serve URL on a 201', async () => {
    const pending = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(201, JSON.stringify({ path: '/api/backgrounds/serve?file=Favorites%2Fa.jpg' }));

    await expect(pending).resolves.toEqual({ ok: true, status: 201, path: '/api/backgrounds/serve?file=Favorites%2Fa.jpg' });
  });

  it('hands back the hub\'s reason on a refusal', async () => {
    const pending = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(413, JSON.stringify({ error: 'That picture is too big' }));

    await expect(pending).resolves.toEqual({ ok: false, status: 413, error: 'That picture is too big' });
  });

  it('answers by status alone when the body is not JSON', async () => {
    const refused = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(502, '<html>Bad gateway</html>');
    await expect(refused).resolves.toEqual({ ok: false, status: 502 });

    const stored = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(201, '');
    await expect(stored).resolves.toEqual({ ok: true, status: 201 });
  });

  it('sends the page to the login screen on a 401 and rejects as an expired session', async () => {
    const pending = uploadLibraryFile(photo(), 'Favorites');
    lastSent().answer(401, '');

    const error = await pending.catch((e: unknown) => e);
    expect(isSessionExpired(error)).toBe(true);
    expect(place.href).toBe(`/login?from=${encodeURIComponent('/remote?tab=photos')}`);
  });

  it.each(['onerror', 'onabort'] as const)('rejects when the request ends with %s', async (handler) => {
    const pending = uploadLibraryFile(photo(), 'Favorites');
    lastSent()[handler]!();

    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(isSessionExpired(error)).toBe(false);
    expect(place.href).toBe('http://localhost:3000/remote?tab=photos');
  });
});
