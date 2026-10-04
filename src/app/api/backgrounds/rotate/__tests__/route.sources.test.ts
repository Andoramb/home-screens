import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { BackgroundRotation, Screen } from '@/types/config';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(),
  requireDisplayAuth: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

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
import { getUnsplashAccessKey } from '@/lib/unsplash';
import { fetchWithTimeout } from '@/lib/api-utils';
import { GET } from '@/app/api/backgrounds/rotate/route';
import { starterBackgroundsIn } from '@/lib/starter-backgrounds';

const mockFindScreen = vi.mocked(findScreenById);
const mockFindDisplay = vi.mocked(findDisplayForScreen);
const mockImmichFetch = vi.mocked(immichFetch);
const mockICloudAlbum = vi.mocked(fetchSharedStreamsAlbum);
const mockUnsplashKey = vi.mocked(getUnsplashAccessKey);
const mockFetch = vi.mocked(fetchWithTimeout);

function rotateReq(query = '?screenId=s1') {
  return new NextRequest(`http://localhost/api/backgrounds/rotate${query}`);
}

function screen(overrides: Partial<Screen> = {}): Screen {
  return { id: 's1', name: 'Home', modules: [], ...overrides } as Screen;
}

function seedCache(entries: Record<string, unknown>): void {
  cacheState.value = entries;
}

beforeEach(() => {
  vi.clearAllMocks();
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

describe('GET /api/backgrounds/rotate — multi-source selection', () => {
  it('rotates from only the selected starter walls and caches until the selection changes', async () => {
    const colors = starterBackgroundsIn('color');
    const initial: BackgroundRotation = { sources: ['color'], query: '', intervalMinutes: 60,
      starterBackgroundIds: { color: [colors[0].id] } };
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: initial }));
    expect(await (await GET(rotateReq())).json()).toEqual({ path: colors[0].path, fresh: true });
    expect(await (await GET(rotateReq())).json()).toEqual({ path: colors[0].path, fresh: false });

    mockFindScreen.mockReturnValue(screen({ backgroundRotation: { ...initial,
      starterBackgroundIds: { color: [colors[1].id] },
    } }));
    expect(await (await GET(rotateReq())).json()).toEqual({ path: colors[1].path, fresh: true });
    expect(await (await GET(rotateReq())).json()).toEqual({ path: colors[1].path, fresh: false });
  });

  it('chooses starter and legacy sources with equal source-level odds, independently of wall count', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: {
      sources: ['color', 'local'], query: '', intervalMinutes: 60,
      starterBackgroundIds: { color: [starterBackgroundsIn('color')[0].id] },
    } }));
    fsMock.readdir.mockResolvedValue([{ name: 'photo.jpg', isFile: () => true }]);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.75);
    try {
      expect(await (await GET(rotateReq())).json()).toEqual({
        path: '/api/backgrounds/serve?file=photo.jpg', fresh: true,
      });
    } finally { random.mockRestore(); }
  });

  it('skips invalid starter subsets and still rotates from a valid legacy source', async () => {
    mockFindScreen.mockReturnValue(screen({ backgroundRotation: {
      sources: ['pattern', 'local', 'bogus'], query: '', intervalMinutes: 60,
      starterBackgroundIds: { pattern: ['invalid'] },
    } as never }));
    fsMock.readdir.mockResolvedValue([{ name: 'photo.jpg', isFile: () => true }]);
    expect(await (await GET(rotateReq())).json()).toEqual({
      path: '/api/backgrounds/serve?file=photo.jpg', fresh: true,
    });
  });

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
