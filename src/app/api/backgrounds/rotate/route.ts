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
import { isRotationActive } from '@/lib/screen-background';

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

/** Unreferenced rotation files kept as a grace buffer, newest first, so a
 *  display still showing the previous background doesn't lose it mid-swap. */
const PRUNE_KEEP_RECENT = 8;

/** Prune unreferenced rotation files, retaining a small grace buffer. */
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

/** Preserve declared dimensions; orientation normalization would flip portrait canvases. */
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
  return [...new Set(rotation.sources)].filter((source) => isSourceConfigured(source, rotation));
}

/** Stable, catalog-filtered selections; omitted/empty means the entire category. */
function starterSelectionKey(rotation: BackgroundRotation): string | undefined {
  const groups = (['theme', 'color', 'pattern'] as const).filter((group) => rotation.sources.includes(group));
  if (!groups.length) return undefined;
  return JSON.stringify(groups.map((group) => {
    const ids = rotation.starterBackgroundIds?.[group];
    return [group, Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))].sort() : []];
  }));
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const screenId = request.nextUrl.searchParams.get('screenId');
  if (!screenId) {
    return NextResponse.json({ error: 'screenId required' }, { status: 400 });
  }

  const config = await readConfig();
  const screen = findScreenById(config, screenId);
  if (!screen) {
    return NextResponse.json({ path: null });
  }

  const rotation = screen.backgroundRotation;
  const eligible = rotation && isRotationActive(rotation) ? configuredSources(rotation) : [];
  if (!rotation || eligible.length === 0) {
    return NextResponse.json({ path: screen.backgroundImage || null });
  }

  const force = request.nextUrl.searchParams.get('force') === 'true';

  const cache = await cacheStore.read();
  const entry = cache[screenId];
  const intervalMs = (rotation.intervalMinutes || 60) * 60 * 1000;
  const now = Date.now();
  const currentSourcesKey = sourcesKey(rotation.sources);
  const immichFilters = rotation.sources.includes('immich')
    ? JSON.stringify({
      a: rotation.immichAlbumIds ?? [],
      p: rotation.immichPersonIds ?? [],
      px: rotation.immichPersonIdsExclude ?? [],
      f: rotation.immichFavoritesOnly,
    })
    : undefined;
  const icloudAlbum = rotation.sources.includes('icloud') ? (rotation.icloudAlbumUrl || '') : undefined;
  const localFolder = rotation.sources.includes('local') ? (rotation.localFolder || '') : undefined;
  const canvas = rotation.sources.includes('unsplash') ? JSON.stringify(canvasOf(config, screenId)) : undefined;
  const unsplashCollectionsKey = rotation.sources.includes('unsplash') && rotation.unsplashCollections?.length
    ? JSON.stringify(rotation.unsplashCollections)
    : undefined;
  const unsplashModeKey = rotation.sources.includes('unsplash') ? (rotation.unsplashMode || '') : undefined;
  const starterSelections = starterSelectionKey(rotation);

  // A source/config change invalidates the cached result before its interval ends.
  if (
    !force &&
    entry &&
    entry.sources === currentSourcesKey &&
    entry.query === rotation.query &&
    entry.intervalMinutes === (rotation.intervalMinutes || 60) &&
    entry.immichFilters === immichFilters &&
    entry.icloudAlbum === icloudAlbum &&
    entry.localFolder === localFolder &&
    entry.canvas === canvas &&
    entry.unsplashCollections === unsplashCollectionsKey &&
    entry.unsplashMode === unsplashModeKey &&
    entry.starterSelections === starterSelections &&
    now - entry.fetchedAt < intervalMs
  ) {
    return NextResponse.json({ path: entry.path, fresh: false });
  }

  const pickedSource = eligible[Math.floor(Math.random() * eligible.length)];

  try {
    const newPath = await backgroundSourceProviders[pickedSource].fetchRandom(rotation, canvasOf(config, screenId));

    if (newPath) {
      const newEntry: RotationCacheEntry = {
        path: newPath,
        sources: currentSourcesKey,
        query: rotation.query,
        fetchedAt: now,
        intervalMinutes: rotation.intervalMinutes || 60,
        immichFilters,
        icloudAlbum,
        localFolder,
        canvas,
        unsplashCollections: unsplashCollectionsKey,
        unsplashMode: unsplashModeKey,
        starterSelections,
      };
      const merged = await cacheStore.updateAtomic((current) => ({ ...current, [screenId]: newEntry }));
      await pruneRotationFiles(merged);
      return NextResponse.json({ path: newPath, fresh: true });
    }
  } catch {
    // Fall through to return cached/fallback
  }

  return NextResponse.json({ path: entry?.path || screen.backgroundImage || null, fresh: false });
}, 'Failed to rotate background');
