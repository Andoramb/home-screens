/**
 * Library path helpers shared by the server (inventory, usage scan) and the
 * editor (grid, viewer). Nothing here touches the DOM or the filesystem.
 * A library path is `folder/name` with posix separators and no leading slash.
 */

/** Width of the WebP copy a grid tile asks the serve route for: tiles are
 *  168px and up, so this covers a 2x screen without fetching originals. */
export const TILE_THUMBNAIL_WIDTH = 480;

/**
 * `width` asks for the small copy the grid shows; `version` (the file's
 * modified time) is ignored by the server and exists so a replaced file gets
 * a new URL, since an <img> or <video> never re-requests an unchanged one.
 */
export function serveUrlFor(libraryPath: string, options?: { width?: number; version?: number }): string {
  let url = `/api/backgrounds/serve?file=${encodeURIComponent(libraryPath)}`;
  if (options?.width) url += `&w=${options.width}`;
  if (options?.version) url += `&v=${options.version}`;
  return url;
}

export function fileNameOf(libraryPath: string): string {
  return libraryPath.slice(libraryPath.lastIndexOf('/') + 1);
}

/** Folder a file sits directly in: '' for the library's top level. */
export function folderOf(libraryPath: string): string {
  const idx = libraryPath.lastIndexOf('/');
  return idx === -1 ? '' : libraryPath.slice(0, idx);
}

/** Lower-case extension including the dot, '' when there is none. */
export function extensionOf(libraryPath: string): string {
  const name = fileNameOf(libraryPath);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/** Upper-case extension, the tag a tile and the viewer show for the format. */
export function typeTagOf(libraryPath: string): string {
  return extensionOf(libraryPath).slice(1).toUpperCase();
}
