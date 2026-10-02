import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Screen } from '@/types/config';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

// `public/backgrounds` is a symlink to the real repo in the test sandbox, so the
// fetch-and-save path must never reach the real filesystem. Mock fs entirely.
// vi.hoisted so the object exists when the hoisted vi.mock factory references it.
// createWriteStream backs writeLibraryFile's streaming save (the iCloud path);
// it must hand back a real Writable or stream.pipeline rejects.
const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  rm: vi.fn(),
}));
const createWriteStreamMock = vi.hoisted(() => vi.fn());
vi.mock('fs', () => ({ promises: fsMock, createWriteStream: createWriteStreamMock }));

// The rotation cache is a json-store now, not a hand-rolled read/write pair.
// Back it with an in-memory object rather than the fs mock above: these tests
// are about rotation logic, and `updateAtomic`'s merge semantics are what the
// route depends on.
const cacheState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/lib/json-store', () => ({
  createJsonStore: () => ({
    read: async () => cacheState.value,
    write: async (next: Record<string, unknown>) => { cacheState.value = next; },
    updateAtomic: async (mutator: (c: Record<string, unknown>) => Record<string, unknown>) => {
      cacheState.value = await mutator(cacheState.value);
      return cacheState.value;
    },
  }),
}));

vi.mock('@/lib/config', () => ({ readConfig: vi.fn().mockResolvedValue({}) }));
vi.mock('@/lib/thumbnails', () => ({ removeThumbnails: vi.fn() }));
vi.mock('@/lib/display-filter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/display-filter')>();
  return { ...actual, findScreenById: vi.fn(), findDisplayForScreen: vi.fn() };
});
vi.mock('@/lib/immich', () => ({ immichFetch: vi.fn() }));
vi.mock('@/lib/icloud-album', () => ({ fetchSharedStreamsAlbum: vi.fn() }));
vi.mock('@/lib/icloud-link', () => ({ fetchCloudKitAlbum: vi.fn() }));
vi.mock('@/lib/unsplash', () => ({
  getUnsplashAccessKey: vi.fn(),
  trackDownload: vi.fn(),
}));
vi.mock('@/lib/nasa', () => ({
  NASA_APOD_API: 'https://api.nasa.gov/planetary/apod',
  getNasaApiKey: vi.fn(),
}));
vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return { ...actual, fetchWithTimeout: vi.fn() };
});

import { Writable } from 'stream';
import { findScreenById, findDisplayForScreen } from '@/lib/display-filter';
import { immichFetch } from '@/lib/immich';
import { fetchSharedStreamsAlbum } from '@/lib/icloud-album';
import { fetchCloudKitAlbum } from '@/lib/icloud-link';
import { getUnsplashAccessKey } from '@/lib/unsplash';
import { getNasaApiKey } from '@/lib/nasa';
import { fetchWithTimeout } from '@/lib/api-utils';
import { removeThumbnails } from '@/lib/thumbnails';
import { readConfig } from '@/lib/config';
import { GET } from '@/app/api/backgrounds/rotate/route';

const mockFindScreen = vi.mocked(findScreenById);
const mockFindDisplay = vi.mocked(findDisplayForScreen);
const mockImmichFetch = vi.mocked(immichFetch);
const mockICloudAlbum = vi.mocked(fetchSharedStreamsAlbum);
const mockCloudKit = vi.mocked(fetchCloudKitAlbum);
const mockUnsplashKey = vi.mocked(getUnsplashAccessKey);
const mockNasaKey = vi.mocked(getNasaApiKey);
const mockFetch = vi.mocked(fetchWithTimeout);

function rotateReq(query = '?screenId=s1') {
  return new NextRequest(`http://localhost/api/backgrounds/rotate${query}`);
}

function screen(overrides: Partial<Screen> = {}): Screen {
  return { id: 's1', name: 'Home', modules: [], ...overrides } as Screen;
}

/** Put entries in the rotation cache the route will read. */
function seedCache(entries: Record<string, unknown>): void {
  cacheState.value = entries;
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks resets call history but not a mock's return value, so a
  // sticky mockReturnValue from one test would otherwise leak into the next.
  mockFindDisplay.mockReturnValue(null);
  cacheState.value = {}; // empty rotation cache by default
  fsMock.readFile.mockRejectedValue(new Error('ENOENT'));
  fsMock.writeFile.mockResolvedValue(undefined);
  fsMock.mkdir.mockResolvedValue(undefined);
  fsMock.readdir.mockResolvedValue([]); // nothing to prune by default
  fsMock.stat.mockResolvedValue({ mtimeMs: 0 });
  fsMock.unlink.mockResolvedValue(undefined);
  fsMock.rm.mockResolvedValue(undefined);
  createWriteStreamMock.mockImplementation(
    () => new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
  );
});

describe('GET /api/backgrounds/rotate — validation & fallbacks', () => {
  it('returns 400 when screenId is missing', async () => {
    const res = await GET(rotateReq(''));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'screenId required' });
  });

  it('returns { path: null } when the screen is not found', async () => {
    mockFindScreen.mockReturnValue(null);

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: null });
  });

  it('returns the static background when rotation is disabled', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: { enabled: false } as never }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(mockImmichFetch).not.toHaveBeenCalled();
  });

  it('returns the static background when unsplash source has no query', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundImage: '/bg.jpg',
        backgroundRotation: { enabled: true, sources: ['unsplash'] } as never,
      }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
  });

  it('returns the static background for an unknown source', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundImage: '/bg.jpg',
        backgroundRotation: { enabled: true, sources: ['bogus'] } as never,
      }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
  });
});

describe('GET /api/backgrounds/rotate — Immich rotation', () => {
  const immichRotation = {
    enabled: true,
    sources: ['immich'],
    intervalMinutes: 60,
  } as never;

  it('serves the cached image without re-fetching when the interval has not elapsed', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: immichRotation }));
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-immich-old.jpg',
        sources: JSON.stringify(['immich']),
        pickedSource: 'immich',
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
        immichFilters: JSON.stringify({ a: [], p: [], px: [], f: undefined }),
      },
    });

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-old.jpg', fresh: false });
    expect(mockImmichFetch).not.toHaveBeenCalled();
  });

  it('fetches and saves a fresh image when there is no cache entry', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: immichRotation }));
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'asset1' }]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({
      path: '/api/backgrounds/serve?file=rotation-immich-asset1.jpg',
      fresh: true,
    });
    // Random search + thumbnail download.
    expect(mockImmichFetch).toHaveBeenCalledTimes(2);
    // The image file is written through fs; the cache entry lands in the store.
    expect(fsMock.writeFile).toHaveBeenCalled();
    expect(cacheState.value).toHaveProperty('s1');
  });

  it('falls back to the static background when the Immich search fails', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: immichRotation }),
    );
    mockImmichFetch.mockResolvedValue(new Response('', { status: 500 }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it('narrows to one randomly-picked album and one person from a multi-select list, not all of them', async () => {
    // Immich's /api/search/random ANDs every id in albumIds/personIds together
    // (asset must be in every listed album, tagged with every listed person),
    // but the picker's lists mean "any of these" — so the provider sends a
    // single randomly-chosen id per list, not the whole array. Math.random
    // pinned to 0 picks the first entry in each list deterministically.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockFindScreen.mockReturnValue(screen({
      backgroundRotation: {
        enabled: true,
        sources: ['immich'],
        intervalMinutes: 60,
        immichAlbumIds: ['album-1', 'album-2'],
        immichPersonIds: ['person-1', 'person-2'],
      } as never,
    }));
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'asset1' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));

    await GET(rotateReq());

    const body = JSON.parse(String(mockImmichFetch.mock.calls[0][1]?.body));
    expect(body.albumIds).toEqual(['album-1']);
    expect(body.personIds).toEqual(['person-1']);
    randomSpy.mockRestore();
  });

  it('excludes a candidate tagged with a person on the exclude list, picking the next one in the batch', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundRotation: {
        enabled: true,
        sources: ['immich'],
        intervalMinutes: 60,
        immichPersonIdsExclude: ['nope'],
      } as never,
    }));
    mockImmichFetch
      // Random batch of candidates.
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'excluded' }, { id: 'ok' }]), { status: 200 }))
      // Asset-detail check for the first candidate: tagged with the excluded person.
      .mockResolvedValueOnce(new Response(JSON.stringify({ people: [{ id: 'nope' }] }), { status: 200 }))
      // Asset-detail check for the second candidate: clean.
      .mockResolvedValueOnce(new Response(JSON.stringify({ people: [] }), { status: 200 }))
      // Thumbnail download for the surviving candidate.
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-ok.jpg', fresh: true });
  });

  it('falls back when every candidate in the batch is excluded', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundImage: '/bg.jpg',
      backgroundRotation: {
        enabled: true,
        sources: ['immich'],
        intervalMinutes: 60,
        immichPersonIdsExclude: ['nope'],
      } as never,
    }));
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'a' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ people: [{ id: 'nope' }] }), { status: 200 }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });
});

describe('GET /api/backgrounds/rotate — force refresh', () => {
  it('bypasses a fresh cache entry when force=true, and always picks a new photo', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundRotation: { enabled: true, sources: ['immich'], intervalMinutes: 60 } as never,
    }));
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-immich-old.jpg',
        sources: JSON.stringify(['immich']),
        pickedSource: 'immich',
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
        immichFilters: JSON.stringify({ a: [], p: [], px: [], f: undefined }),
      },
    });
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'fresh' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));

    const res = await GET(rotateReq('?screenId=s1&force=true'));
    const json = await res.json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-fresh.jpg', fresh: true });
    expect(mockImmichFetch).toHaveBeenCalled();
  });
});

describe('GET /api/backgrounds/rotate — Unsplash rotation', () => {
  const unsplashRotation = {
    enabled: true,
    sources: ['unsplash'],
    query: 'mountains',
    intervalMinutes: 60,
  } as never;

  it('falls back to the static background when no Unsplash access key is configured', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: unsplashRotation }),
    );
    mockUnsplashKey.mockResolvedValue(null);

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it('fetches Unsplash metadata, downloads the image, and saves a fresh path', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: unsplashRotation }));
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'photo42',
            urls: { regular: 'https://images.unsplash.com/photo42' },
            links: { download_location: 'https://api.unsplash.com/photos/photo42/download' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({
      path: '/api/backgrounds/serve?file=rotation-unsplash-photo42.jpg',
      fresh: true,
    });
    // Metadata fetch + image download.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(fsMock.writeFile).toHaveBeenCalled();
    // No owning display resolved and no global canvas configured, so canvasOf
    // falls back to DEFAULT_DISPLAY_WIDTH/HEIGHT (1080x1920 — portrait).
    expect(mockFetch.mock.calls[0][0]).toContain('orientation=portrait');
  });

  it('uses the collections param instead of query when unsplashCollections is set', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['unsplash'],
          query: 'mountains',
          unsplashCollections: ['I6rVqHIQXO0', 'abc123'],
          intervalMinutes: 60,
        } as never,
      }),
    );
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo42', urls: { regular: 'https://images.unsplash.com/photo42' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    await GET(rotateReq());

    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain('collections=I6rVqHIQXO0,abc123');
    expect(requestedUrl).not.toContain('query=');
  });

  it('uses query, not a leftover unsplashCollections array, when unsplashMode is explicitly "query"', async () => {
    // Reproduces the reported bug: switching the editor's toggle back to
    // "Search query" keeps `unsplashCollections` around (so re-entering
    // collections mode doesn't lose it) instead of clearing it. The fetch
    // must key off `unsplashMode`, not "is unsplashCollections non-empty",
    // or it would silently keep drawing from the old collection.
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['unsplash'],
          query: 'space',
          unsplashCollections: ['leftover-collection'],
          unsplashMode: 'query',
          intervalMinutes: 60,
        } as never,
      }),
    );
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo42', urls: { regular: 'https://images.unsplash.com/photo42' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    await GET(rotateReq());

    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain('query=space');
    expect(requestedUrl).not.toContain('collections=');
  });

  it('uses collections, not query, when unsplashMode is explicitly "collections"', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['unsplash'],
          query: 'space',
          unsplashCollections: ['active-collection'],
          unsplashMode: 'collections',
          intervalMinutes: 60,
        } as never,
      }),
    );
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo42', urls: { regular: 'https://images.unsplash.com/photo42' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    await GET(rotateReq());

    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain('collections=active-collection');
    expect(requestedUrl).not.toContain('query=');
  });

  it('includes the orientation param when the owning display resolves dimensions', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: unsplashRotation }));
    mockFindDisplay.mockReturnValue({
      id: 'd1',
      name: 'Kitchen',
      screens: [],
      displayWidth: 1024,
      displayHeight: 600,
    } as never);
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo42', urls: { regular: 'https://images.unsplash.com/photo42' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([7, 7, 7]), { status: 200 }));

    await GET(rotateReq());

    const requestedUrl = mockFetch.mock.calls[0][0] as string;
    expect(requestedUrl).toContain('orientation=landscape');
  });

  it('invalidates the cached entry when unsplashCollections changes between requests', async () => {
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['unsplash'],
          query: 'mountains',
          unsplashCollections: ['new-collection'],
          intervalMinutes: 60,
        } as never,
      }),
    );
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-unsplash-old.jpg',
        sources: JSON.stringify(['unsplash']),
        pickedSource: 'unsplash',
        query: 'mountains',
        unsplashCollections: JSON.stringify(['old-collection']),
        fetchedAt: Date.now(),
        intervalMinutes: 60,
      },
    });
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'photo99', urls: { regular: 'https://images.unsplash.com/photo99' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([9]), { status: 200 }));

    const res = await GET(rotateReq());
    const json = await res.json();

    // A fresh fetch happened (not the stale cache), because the collections
    // key no longer matches what's stored in the cache entry.
    expect(json).toEqual({
      path: '/api/backgrounds/serve?file=rotation-unsplash-photo99.jpg',
      fresh: true,
    });
  });
});

describe('GET /api/backgrounds/rotate: Unsplash sized to the wall', () => {
  const unsplashRotation = { enabled: true, sources: ['unsplash'], query: 'lakes', intervalMinutes: 60 } as never;

  function photoResponse() {
    return new Response(JSON.stringify({
      id: 'p9',
      urls: { raw: 'https://images.unsplash.com/photo-p9?ixid=abc', regular: 'https://images.unsplash.com/photo-p9-regular' },
    }), { status: 200 });
  }

  it('asks for a photo shaped like the display that owns the screen, cropped to its canvas', async () => {
    vi.mocked(readConfig).mockResolvedValueOnce({
      settings: { displayWidth: 1080, displayHeight: 1920 },
      displays: [{ id: 'kitchen', name: 'Kitchen', displayWidth: 1920, displayHeight: 1080, screens: [{ id: 's1' }] }],
      screens: [],
    } as never);
    // findDisplayForScreen is fully mocked in this file (not delegated to the
    // real implementation), so it must be told directly what it would have
    // resolved from the config above.
    mockFindDisplay.mockReturnValue({ id: 'kitchen', name: 'Kitchen', displayWidth: 1920, displayHeight: 1080, screens: [] } as never);
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: unsplashRotation }));
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(photoResponse())
      .mockResolvedValueOnce(new Response(new Uint8Array([7]), { status: 200 }));

    await GET(rotateReq());

    expect(String(mockFetch.mock.calls[0][0])).toContain('orientation=landscape');
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://images.unsplash.com/photo-p9?ixid=abc&fit=crop&w=1920&h=1080&q=80&fm=jpg',
    );
  });

  it('falls back to the shared canvas, portrait by default', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: unsplashRotation }));
    mockUnsplashKey.mockResolvedValue('unsplash-key');
    mockFetch
      .mockResolvedValueOnce(photoResponse())
      .mockResolvedValueOnce(new Response(new Uint8Array([7]), { status: 200 }));

    await GET(rotateReq());

    expect(String(mockFetch.mock.calls[0][0])).toContain('orientation=portrait');
    expect(String(mockFetch.mock.calls[1][0])).toContain('&w=1080&h=1920');
  });
});

describe('GET /api/backgrounds/rotate — multi-source selection', () => {
  it('skips a source missing its required config in favor of a configured one', async () => {
    // Unsplash is listed but has neither query nor collections, so it can
    // never be the one picked, however Math.random() happens to land —
    // Immich is the only actually-configured source in this list.
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['unsplash', 'immich'],
          query: '',
          intervalMinutes: 60,
        } as never,
      }),
    );
    mockImmichFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'asset1' }]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
      );

    const res = await GET(rotateReq());
    const json = await res.json();

    // Only the configured source (Immich) was ever eligible; Unsplash's
    // fetch path (which needs an access key first) was never touched.
    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-immich-asset1.jpg', fresh: true });
    expect(mockUnsplashKey).not.toHaveBeenCalled();
  });

  it('only ever picks from rotation.sources, never a source left off the list', async () => {
    // iCloud is the only listed source; even though Immich would resolve if
    // called, it must never be, because it isn't in `sources`.
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['icloud'],
          icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC',
          intervalMinutes: 60,
        } as never,
      }),
    );
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'only' },
    ]);
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } }));

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-only.png', fresh: true });
    expect(mockImmichFetch).not.toHaveBeenCalled();
  });

  it('invalidates the cached entry when the sources list changes, even mid-interval', async () => {
    // Pin the random pick to the first eligible source (icloud) so this test
    // only exercises cache invalidation, not source selection.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    mockFindScreen.mockReturnValue(
      screen({
        backgroundRotation: {
          enabled: true,
          sources: ['icloud', 'immich'],
          icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC',
          intervalMinutes: 60,
        } as never,
      }),
    );
    // Cached entry was fetched while `sources` was just `['icloud']` — still
    // within the interval, but the configured set has grown since.
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-icloud-old.jpg',
        sources: JSON.stringify(['icloud']),
        pickedSource: 'icloud',
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
      },
    });
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'new' },
    ]);
    mockImmichFetch.mockResolvedValue(new Response('', { status: 500 }));
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } }));

    const res = await GET(rotateReq());
    const json = await res.json();

    // A fresh fetch happened rather than serving the stale entry — the
    // `sources` key on the cache entry no longer matches the current list.
    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-new.png', fresh: true });
    randomSpy.mockRestore();
  });
});

describe('GET /api/backgrounds/rotate — NASA APOD rotation', () => {
  const apodRotation = {
    enabled: true,
    sources: ['nasa-apod'],
    intervalMinutes: 60,
  } as never;

  it('fetches the APOD image and saves a fresh path keyed by date', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: apodRotation }));
    mockNasaKey.mockResolvedValue('nasa-key');
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            media_type: 'image',
            date: '2024-05-01',
            hdurl: 'https://apod.nasa.gov/hd.jpg',
            url: 'https://apod.nasa.gov/std.jpg',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 1]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({
      path: '/api/backgrounds/serve?file=rotation-nasa-apod-20240501.jpg',
      fresh: true,
    });
    expect(fsMock.writeFile).toHaveBeenCalled();
  });

  it('falls back to the static background when the APOD entry is not an image', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: apodRotation }),
    );
    mockNasaKey.mockResolvedValue('nasa-key');
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ media_type: 'video', date: '2024-05-01' }), { status: 200 }),
    );

    const res = await GET(rotateReq());
    const json = await res.json();

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });
});

describe('GET /api/backgrounds/rotate — iCloud rotation', () => {
  const icloudRotation = {
    enabled: true,
    sources: ['icloud'],
    icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC',
    intervalMinutes: 60,
  } as never;

  function pngResponse() {
    return new Response(new Uint8Array([1, 2]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
  }

  it('picks only images (a video cannot be a CSS background) and keys the file by sanitized GUID', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/v', type: 'video', guid: 'vid-1' },
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'pic/1!' },
    ]);
    mockFetch.mockResolvedValue(pngResponse());

    const res = await GET(rotateReq());
    const json = await res.json();

    // One image in the album → random can only pick it. GUID sanitized to
    // alphanumerics; extension mapped from the response Content-Type.
    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-pic1.png', fresh: true });
    expect(String(mockFetch.mock.calls[0][0])).toBe('https://cvws.icloud-content.com/p');
    // The image streams to disk (writeLibraryFile) rather than buffering whole.
    expect(String(createWriteStreamMock.mock.calls[0][0])).toContain('rotation-icloud-pic1.png');
  });

  it('rotates from a new-format album through the CloudKit backend', async () => {
    mockFindScreen.mockReturnValue(screen({
      backgroundRotation: {
        enabled: true,
        sources: ['icloud'],
        icloudAlbumUrl: 'https://photos.icloud.com/shared/album/03c4SA2q7HwyPw7YOwfXTn0mg',
        intervalMinutes: 60,
      } as never,
    }));
    mockCloudKit.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'ck-1' },
    ]);
    mockFetch.mockResolvedValue(pngResponse());

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-ck-1.png', fresh: true });
    expect(mockCloudKit).toHaveBeenCalledWith('03c4SA2q7HwyPw7YOwfXTn0mg');
    expect(mockICloudAlbum).not.toHaveBeenCalled();
  });

  it('falls back to the static background when the album has no photos', async () => {
    mockFindScreen.mockReturnValue(
      screen({ backgroundImage: '/bg.jpg', backgroundRotation: icloudRotation }),
    );
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/v', type: 'video', guid: 'vid-1' },
    ]);

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/bg.jpg' });
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it('serves the cached image while fresh, without re-resolving the album', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-icloud-old.jpg',
        sources: JSON.stringify(['icloud']),
        pickedSource: 'icloud',
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
        icloudAlbum: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC',
      },
    });

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-old.jpg', fresh: false });
    expect(mockICloudAlbum).not.toHaveBeenCalled();
  });

  it('refetches immediately when the configured album changes, even mid-interval', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-icloud-old.jpg',
        sources: JSON.stringify(['icloud']),
        pickedSource: 'icloud',
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
        icloudAlbum: 'https://www.icloud.com/sharedalbum/#DIFFERENTALBUM',
      },
    });
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'new' },
    ]);
    mockFetch.mockResolvedValue(pngResponse());

    const json = await (await GET(rotateReq())).json();

    expect(json).toEqual({ path: '/api/backgrounds/serve?file=rotation-icloud-new.png', fresh: true });
    expect(mockICloudAlbum).toHaveBeenCalledTimes(1);
  });

  it('keeps an entry another screen committed while this fetch was in flight', async () => {
    // The window this closes: the route read the whole cache, awaited a
    // multi-second upstream fetch, then wrote its pre-fetch snapshot back. Any
    // rotation that finished for another screen in between was erased. The
    // write is an `updateAtomic` merge now, so both entries survive.
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    seedCache({});
    mockICloudAlbum.mockImplementation(async () => {
      cacheState.value = {
        ...cacheState.value,
        s2: {
          path: '/api/backgrounds/serve?file=rotation-unsplash-other.jpg',
          sources: JSON.stringify(['unsplash']),
          pickedSource: 'unsplash',
          query: 'x',
          fetchedAt: Date.now(),
          intervalMinutes: 60,
        },
      };
      return [{ url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'new' }];
    });
    mockFetch.mockResolvedValue(pngResponse());

    await GET(rotateReq());

    expect(Object.keys(cacheState.value).sort()).toEqual(['s1', 's2']);
  });
});

describe('GET /api/backgrounds/rotate — rotation file pruning', () => {
  const icloudRotation = {
    enabled: true,
    sources: ['icloud'],
    icloudAlbumUrl: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC',
    intervalMinutes: 60,
  } as never;

  function dirent(name: string, isFile = true) {
    return { name, isFile: () => isFile };
  }

  it('deletes old unreferenced rotation files but never user files or referenced ones', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    // Another screen's cache entry still references one rotation file.
    seedCache({
      s2: {
        path: '/api/backgrounds/serve?file=rotation-unsplash-kept.jpg',
        sources: JSON.stringify(['unsplash']),
        pickedSource: 'unsplash',
        query: 'x',
        fetchedAt: 0,
        intervalMinutes: 60,
      },
    });
    mockICloudAlbum.mockResolvedValue([
      { url: 'https://cvws.icloud-content.com/p', type: 'image', guid: 'now' },
    ]);
    mockFetch.mockResolvedValue(new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }));

    const stale = Array.from({ length: 10 }, (_, i) => `rotation-icloud-stale${i}.jpg`);
    fsMock.readdir.mockResolvedValue([
      ...stale.map((name) => dirent(name)),
      dirent('icloud-userimport.jpg'),        // user import — no rotation- prefix
      dirent('rotation-unsplash-kept.jpg'),   // referenced by s2's cache entry
      dirent('icloud-imports', false),        // a folder, not a file
    ]);
    // mtimeMs increases with the stale index, so stale0/stale1 are the oldest.
    fsMock.stat.mockImplementation(async (p: unknown) => ({
      mtimeMs: Number(String(p).match(/stale(\d+)/)?.[1] ?? 99),
    }));

    await GET(rotateReq());

    const unlinked = fsMock.unlink.mock.calls.map(([p]) => String(p).split('/').pop()).sort();
    // 10 unreferenced candidates, newest 8 kept as the grace buffer.
    expect(unlinked).toEqual(['rotation-icloud-stale0.jpg', 'rotation-icloud-stale1.jpg']);
    // Their wall-sized copies go with them.
    expect(vi.mocked(removeThumbnails).mock.calls.map(([name]) => name).sort()).toEqual(unlinked);
  });

  it('does not prune on a request that served from cache', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: icloudRotation }));
    seedCache({
      s1: {
        path: '/api/backgrounds/serve?file=rotation-icloud-old.jpg',
        sources: JSON.stringify(['icloud']),
        pickedSource: 'icloud',
        query: undefined,
        fetchedAt: Date.now(),
        intervalMinutes: 60,
        icloudAlbum: 'https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC',
      },
    });

    await GET(rotateReq());

    expect(fsMock.readdir).not.toHaveBeenCalled();
    expect(fsMock.unlink).not.toHaveBeenCalled();
  });
});
