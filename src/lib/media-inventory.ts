import type { MediaUse, MissingMedia } from '@/lib/media-usage';

/** Inventory payload shared by the route and the settings page. */
export interface MediaInventoryItem {
  /** Library-relative path, posix separators (folder/file). */
  path: string;
  kind: 'image' | 'video';
  bytes: number;
  /** Last modified, epoch milliseconds, for the Newest sort. */
  mtimeMs: number;
  /** Images only, and only when the file parses; corrupt files ship without. */
  width?: number;
  height?: number;
}

export interface MediaInventoryDirectory {
  name: string;
  path: string;
}

export interface MediaInventoryStorage {
  /** Bytes of every listed file. */
  bytes: number;
  /** Free space on the volume the library sits on; absent when unknown. */
  freeBytes?: number;
  totalBytes?: number;
}

export interface MediaInventory {
  items: MediaInventoryItem[];
  directories: MediaInventoryDirectory[];
  /** Paths the config still references, keyed by library-relative path. */
  usage: Record<string, MediaUse[]>;
  /** Config references to files or folders that are not in the library. */
  missing: MissingMedia[];
  storage: MediaInventoryStorage;
}
