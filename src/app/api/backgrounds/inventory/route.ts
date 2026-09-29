import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { readConfig } from '@/lib/config';
import { scanMediaUsage, scanMissingMedia, slideshowFolders } from '@/lib/media-usage';
import { withAuth } from '@/lib/api-utils';
import { libraryRoot } from '@/lib/library-files';
import { IMAGE_FILE_RE, VIDEO_FILE_RE } from '@/lib/media-formats';
import { readImageDimensions } from '@/lib/image-dimensions';
import { ROTATION_FILE_RE } from '@/lib/background-rotation-cache';
import type {
  MediaInventory,
  MediaInventoryDirectory,
  MediaInventoryItem,
  MediaInventoryStorage,
} from '@/lib/media-inventory';

export const dynamic = 'force-dynamic';

/** Dimensions are re-read only when a file's size or mtime changes; a page
 *  refresh after one delete must not re-parse every header in the library.
 *  Bounded by a full clear so a churning library cannot grow it forever. */
const DIMENSION_CACHE_MAX = 5000;
interface DimensionCacheEntry {
  size: number;
  mtimeMs: number;
  dims: { width: number; height: number } | undefined;
}
const dimensionCache = new Map<string, DimensionCacheEntry>();

/** Stable output order regardless of readdir ordering. */
function byPath<T extends { path: string }>(a: T, b: T): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

async function cachedImageDimensions(
  full: string,
  stat: { size: number; mtimeMs: number },
): Promise<{ width: number; height: number } | undefined> {
  const hit = dimensionCache.get(full);
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.dims;
  const dims = await readImageDimensions(full, stat.size);
  if (dimensionCache.size >= DIMENSION_CACHE_MAX) dimensionCache.clear();
  dimensionCache.set(full, { size: stat.size, mtimeMs: stat.mtimeMs, dims });
  return dims;
}

interface LibraryWalk {
  items: MediaInventoryItem[];
  directories: MediaInventoryDirectory[];
  /** Top-level rotation files: on disk, so not "missing", but never listed. */
  hidden: string[];
}

/**
 * Walk the library two folder levels deep (root files, subfolder files, and
 * one nesting below that, the same shape `scanDirectories` covers). Every
 * image-or-video file becomes an item; every subfolder becomes a directory
 * entry, empty folders included. Symlinks are skipped, as the picker listing
 * skips them, and so are the top-level rotation files the background
 * rotation writes and prunes on its own. A missing or unreadable folder
 * contributes nothing rather than failing the request.
 */
async function walkLibrary(): Promise<LibraryWalk> {
  const items: MediaInventoryItem[] = [];
  const directories: MediaInventoryDirectory[] = [];
  const hidden: string[] = [];

  async function scan(dir: string, rel: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Folders live at most two deep; a third level is never listed.
        if (depth >= 2) continue;
        const relDir = rel ? `${rel}/${entry.name}` : entry.name;
        await scan(full, relDir, depth + 1);
        directories.push({ name: entry.name, path: relDir });
        continue;
      }
      if (!entry.isFile()) continue;
      const isImage = IMAGE_FILE_RE.test(entry.name);
      const isVideo = VIDEO_FILE_RE.test(entry.name);
      if (!isImage && !isVideo) continue;
      if (depth === 0 && ROTATION_FILE_RE.test(entry.name)) {
        hidden.push(entry.name);
        continue;
      }
      let stat;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      const item: MediaInventoryItem = {
        path: rel ? `${rel}/${entry.name}` : entry.name,
        kind: isImage ? 'image' : 'video',
        bytes: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      };
      if (isImage) {
        const dims = await cachedImageDimensions(full, stat);
        if (dims) {
          item.width = dims.width;
          item.height = dims.height;
        }
      }
      items.push(item);
    }
  }

  await scan(libraryRoot(), '', 0);
  items.sort(byPath);
  directories.sort(byPath);
  return { items, directories, hidden };
}

/** Free space on the volume holding the library; absent when the platform
 *  cannot say (statfs is best-effort, never a reason to fail the page). */
async function volumeSpace(): Promise<Pick<MediaInventoryStorage, 'freeBytes' | 'totalBytes'>> {
  try {
    const stats = await fs.statfs(libraryRoot());
    return { freeBytes: stats.bsize * stats.bavail, totalBytes: stats.bsize * stats.blocks };
  } catch {
    return {};
  }
}

export const GET = withAuth(async () => {
  const { items, directories, hidden } = await walkLibrary();

  // Only paths that exist in the library can be "in use", so the known-path
  // set comes straight from the walk.
  const config = await readConfig();
  const knownPaths = new Set(items.map((item) => item.path));
  const usageMap = scanMediaUsage(config, knownPaths);
  const usage: MediaInventory['usage'] = {};
  for (const [p, uses] of usageMap) usage[p] = uses;

  const missing = scanMissingMedia(
    config,
    new Set([...knownPaths, ...hidden]),
    new Set(directories.map((d) => d.path)),
  );

  const storage: MediaInventoryStorage = {
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
    ...(await volumeSpace()),
  };

  const inventory: MediaInventory = { items, directories, usage, missing, storage, slideshows: slideshowFolders(config) };
  return NextResponse.json(inventory);
}, 'Failed to build media inventory');
