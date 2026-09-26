/**
 * Every image and video format the media library knows, and the size caps
 * uploads and imports are held to. Pure data, so the phone and the editor can
 * check a file before sending it with the same numbers the hub enforces.
 *
 * The upload gate, the folder listings, the served content-type and the usage
 * scan all derive from these two tables, so adding a format here is the whole
 * change (svg once landed in three of four places and folder counts disagreed
 * with folder listings).
 */

export const IMAGE_MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  // JPEG spellings some cameras and sites produce; all are image/jpeg.
  '.jfif': 'image/jpeg',
  '.pjpeg': 'image/jpeg',
  '.pjp': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

export const VIDEO_MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function extensionPattern(table: Readonly<Record<string, string>>): RegExp {
  return new RegExp(`\\.(${Object.keys(table).map((ext) => ext.slice(1)).join('|')})$`, 'i');
}

/** Filename tests for library entries (case-insensitive, extension only). */
export const IMAGE_FILE_RE = extensionPattern(IMAGE_MIME_BY_EXT);
export const VIDEO_FILE_RE = extensionPattern(VIDEO_MIME_BY_EXT);

/** MIME types uploads may declare, one per distinct format. */
export const IMAGE_MIME_TYPES: readonly string[] = [...new Set(Object.values(IMAGE_MIME_BY_EXT))];
export const VIDEO_MIME_TYPES: readonly string[] = [...new Set(Object.values(VIDEO_MIME_BY_EXT))];

/** Whether a library file is a picture or a video, by its name; null for anything else. */
export function mediaKindOf(fileName: string): 'image' | 'video' | null {
  if (IMAGE_FILE_RE.test(fileName)) return 'image';
  if (VIDEO_FILE_RE.test(fileName)) return 'video';
  return null;
}

/** Size caps shared by uploads and imports. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image file
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB per video file

/** Server-fetched images (iCloud imports, background rotation) get a higher
 *  ceiling than uploads: Apple originals (48 MP photos) legitimately exceed
 *  10 MB. */
export const MAX_IMPORT_IMAGE_BYTES = 50 * 1024 * 1024;
