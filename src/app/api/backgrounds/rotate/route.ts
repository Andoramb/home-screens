import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { readConfig } from '@/lib/config';
import { BACKGROUNDS_DIR, DEFAULT_DISPLAY_HEIGHT, DEFAULT_DISPLAY_WIDTH } from '@/lib/constants';
import { removeThumbnails } from '@/lib/thumbnails';
import { withDisplayAuth } from '@/lib/api-utils';
import { findScreenById, findDisplayForScreen } from '@/lib/display-filter';
import { backgroundSourceProviders, isSourceConfigured } from '@/lib/background-sources';
import {
  ROTATION_FILE_RE,
  referencedRotationFiles,
  rotationCacheStore as cacheStore,
  type BackgroundCache,
  type RotationCacheEntry,
} from '@/lib/background-rotation-cache';
import type { BackgroundRotation, BackgroundRotationSourceId, ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

/** Unreferenced rotation files kept as a grace buffer, newest first, so a
 *  display still showing the previous background doesn't lose it mid-swap. */
const PRUNE_KEEP_RECENT = 8;

/**
 * Rotation files accumulate forever otherwise: an iCloud album alone can
 * leave thousands of one-time backgrounds on a Pi SD card over a few weeks.
 * Deletes rotation-cache files that no screen's cache entry references,
 * keeping the newest few as a grace buffer. Best-effort: any error just
 * leaves files for the next rotation to prune.
 */
async function pruneRotationFiles(cache: BackgroundCache): Promise<void> {
  const referenced = referencedRotationFiles(cache);

  let entries;
  try {
    entries = await fs.readdir(BGS, { withFileTypes: true });
  } catch {
    return;
  }

  const candidates: Array<{ name: string; mtimeMs: number }> = [];
  for (const dirent of entries) {
    if (!dirent.isFile() || !ROTATION_FILE_RE.test(dirent.name) || referenced.has(dirent.name)) continue;
    try {
      candidates.push({ name: dirent.name, mtimeMs: (await fs.stat(path.join(BGS, dirent.name))).mtimeMs });
    } catch { /* raced deletion */ }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const { name } of candidates.slice(PRUNE_KEEP_RECENT)) {
    await fs.unlink(path.join(BGS, name)).catch(() => { /* best effort */ });
    // The wall asked for a copy sized to its screen; it goes with the file.
    await removeThumbnails(name);
  }
}

/** The canvas a screen is painted on: its own display's size, or the shared
 *  one. Deliberately does NOT run these through `orientDimensions` — that
 *  helper always normalizes to landscape unless `transform` is explicitly
 *  `90`/`270` (it's built for reorienting a physical panel's long/short
 *  sides, not for reporting a declared width/height as-is), which would
 *  silently flip a portrait default like DEFAULT_DISPLAY_WIDTH/HEIGHT into a
 *  landscape canvas. Declared dimensions are used verbatim instead. Passed
 *  through to whichever source provider gets picked; only the unsplash
 *  provider uses it (for orientation + an exact crop), the rest ignore it. */
function canvasOf(config: ScreenConfiguration, screenId: string): { w: number; h: number } {
  const display = findDisplayForScreen(config, screenId);
  return {
    w: display?.displayWidth ?? config.settings?.displayWidth ?? DEFAULT_DISPLAY_WIDTH,
    h: display?.displayHeight ?? config.settings?.displayHeight ?? DEFAULT_DISPLAY_HEIGHT,
  };
}

/** Stable key for a sources array, independent of list order, for the cache freshness check. */
function sourcesKey(sources: BackgroundRotationSourceId[]): string {
  return JSON.stringify([...sources].sort());
}

/** Sources in `rotation.sources` that have what they need to actually produce a photo. */
function configuredSources(rotation: BackgroundRotation): BackgroundRotationSourceId[] {
  return rotation.sources.filter((source) => isSourceConfigured(source, rotation));
}

/**
 * GET /api/backgrounds/rotate?screenId=X
 *
 * Returns the current rotating background for a screen, fetching a new one
 * from a randomly-picked configured source only when the configured
 * interval has elapsed.
 *
 * Response: { path: string, fresh: boolean } or { path: null }
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const screenId = request.nextUrl.searchParams.get('screenId');
  if (!screenId) {
    return NextResponse.json({ error: 'screenId required' }, { status: 400 });
  }

  // Read config to get this screen's rotation settings. Look across every
  // display's owned `screens` AND the legacy global pool — in multi-display
  // mode the screen we care about almost certainly lives under a
  // `display.screens` array, not `config.screens`.
  const config = await readConfig();
  const screen = findScreenById(config, screenId);
  if (!screen) {
    return NextResponse.json({ path: null });
  }

  const rotation = screen.backgroundRotation;
  const eligible = rotation?.enabled ? configuredSources(rotation) : [];
  if (!rotation?.enabled || rotation.sources.length === 0 || eligible.length === 0) {
    return NextResponse.json({ path: screen.backgroundImage || null });
  }

  const cache = await cacheStore.read();
  const entry = cache[screenId];
  const intervalMs = (rotation.intervalMinutes || 60) * 60 * 1000;
  const now = Date.now();
  const currentSourcesKey = sourcesKey(rotation.sources);
  const immichFilters = rotation.sources.includes('immich')
    ? JSON.stringify({ a: rotation.immichAlbumId, p: rotation.immichPersonId, f: rotation.immichFavoritesOnly })
    : undefined;
  const icloudAlbum = rotation.sources.includes('icloud') ? (rotation.icloudAlbumUrl || '') : undefined;
  const unsplashCollectionsKey = rotation.sources.includes('unsplash') && rotation.unsplashCollections?.length
    ? JSON.stringify(rotation.unsplashCollections)
    : undefined;

  // Check if cached entry is still fresh. `sources` must match the whole
  // configured set (not just the picked one) so adding or removing a source
  // invalidates the cache even before the interval elapses — otherwise a
  // screen that just gained a new source wouldn't draw from it until the
  // next natural refresh, and one that lost a source could keep serving a
  // photo from it forever if that photo happens to still be cached.
  if (
    entry &&
    entry.sources === currentSourcesKey &&
    entry.query === rotation.query &&
    entry.intervalMinutes === (rotation.intervalMinutes || 60) &&
    entry.immichFilters === immichFilters &&
    entry.icloudAlbum === icloudAlbum &&
    entry.unsplashCollections === unsplashCollectionsKey &&
    now - entry.fetchedAt < intervalMs
  ) {
    return NextResponse.json({ path: entry.path, fresh: false });
  }

  // Need to fetch a new background: pick one source uniformly at random from
  // whichever of `rotation.sources` are actually configured.
  const pickedSource = eligible[Math.floor(Math.random() * eligible.length)];

  try {
    const newPath = await backgroundSourceProviders[pickedSource].fetchRandom(rotation, canvasOf(config, screenId));

    if (newPath) {
      const newEntry: RotationCacheEntry = {
        path: newPath,
        sources: currentSourcesKey,
        pickedSource,
        query: rotation.query,
        fetchedAt: now,
        intervalMinutes: rotation.intervalMinutes || 60,
        immichFilters,
        icloudAlbum,
        unsplashCollections: unsplashCollectionsKey,
      };
      // Merge into whatever is on disk now, not into the snapshot read before
      // the fetch above, so a rotation that finished for another screen while
      // this one was waiting on the network keeps its entry.
      const merged = await cacheStore.updateAtomic((current) => ({ ...current, [screenId]: newEntry }));
      // Prune against the merged view; pruning against the stale snapshot
      // would delete files the other screen just claimed.
      await pruneRotationFiles(merged);
      return NextResponse.json({ path: newPath, fresh: true });
    }
  } catch {
    // Fall through to return cached/fallback
  }

  return NextResponse.json({ path: entry?.path || screen.backgroundImage || null });
}, 'Failed to rotate background');
