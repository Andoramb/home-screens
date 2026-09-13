/** Inventory payload shared by the route and the settings page. */
export interface MediaInventoryItem {
  /** Library-relative path, posix separators (folder/file). */
  path: string;
  kind: 'image' | 'video';
  bytes: number;
  /** Images only, and only when the file parses; corrupt files ship without. */
  width?: number;
  height?: number;
}

export interface MediaInventoryDirectory {
  name: string;
  path: string;
  /** Files of either kind directly inside this folder (non-recursive). */
  count: number;
}

export interface MediaInventory {
  items: MediaInventoryItem[];
  directories: MediaInventoryDirectory[];
  /** Paths the config still references, keyed by library-relative path. */
  usage: Record<string, { kind: string; name?: string; configPath: string }[]>;
}
