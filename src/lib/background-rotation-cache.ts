import { createJsonStore } from '@/lib/json-store';


export interface RotationCacheEntry {
  path: string;
  /** Every source the screen's rotation was configured to draw from at fetch time, stable-sorted-JSON. */
  sources: string;
  query: string;
  fetchedAt: number;
  intervalMinutes: number;
  immichFilters?: string;
  icloudAlbum?: string;
  localFolder?: string;
  canvas?: string;
  unsplashCollections?: string;
  unsplashMode?: string;
  /** Stable selections for enabled starter source groups. */
  starterSelections?: string;
}

export type BackgroundCache = Record<string, RotationCacheEntry>;

/** Atomic writes prevent concurrent rotations from clobbering each other. */
export const rotationCacheStore = createJsonStore<BackgroundCache>({
  path: 'data/background-cache.json',
  defaultValue: {},
  transient: true,
});

/** Only files the rotation savers wrote themselves (top-level, this prefix);
 *  user uploads and iCloud imports never carry it, so pruning can't touch
 *  them and the library page never lists them. */
export const ROTATION_FILE_RE = /^rotation-/;

/** Library-relative path a cached serve URL points at, or null. */
export function rotationCacheFileName(servePath: string): string | null {
  try {
    return new URL(servePath, 'http://local').searchParams.get('file');
  } catch {
    return null;
  }
}

/** Top-level rotation files some screen's cache entry still names. */
export function referencedRotationFiles(cache: BackgroundCache): Set<string> {
  const referenced = new Set<string>();
  for (const entry of Object.values(cache)) {
    const name = rotationCacheFileName(entry.path);
    if (name) referenced.add(name);
  }
  return referenced;
}

/** True for a library-relative path the rotation feature owns. */
export function isRotationFile(libraryPath: string): boolean {
  return !libraryPath.includes('/') && ROTATION_FILE_RE.test(libraryPath);
}
