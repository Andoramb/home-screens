import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deleteLibraryFile, deleteLibraryImage, usageNames } from '@/lib/library-client';

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
