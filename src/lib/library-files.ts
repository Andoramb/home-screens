import { createWriteStream, promises as fs } from 'fs';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import { BACKGROUNDS_DIR } from './constants';

/**
 * Shared filesystem plumbing for the media library (public/backgrounds).
 * Every writer — user uploads and iCloud imports alike — goes through the
 * same traversal guard and the same streaming write, so the anti-OOM and
 * anti-escape properties can't drift between entry points.
 */

/** Absolute path of the media library root. Computed per call so tests that
 *  override process.cwd() (or the vitest sandbox chdir) always resolve into
 *  their own isolated library. */
export function libraryRoot(): string {
  return path.join(process.cwd(), BACKGROUNDS_DIR);
}

/**
 * Every image and video format the library knows, keyed by extension. The
 * upload gate, the folder counts, the listing filter and the served
 * content-type all derive from these two tables, so adding a format here is
 * the whole change (svg once landed in three of the four and folder counts
 * disagreed with folder listings).
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

/** Size caps shared by uploads and imports. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image file
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB per video file

/** Server-fetched images (iCloud imports, background rotation) get a higher
 *  ceiling than uploads: Apple originals (48 MP photos) legitimately exceed
 *  10 MB. */
export const MAX_IMPORT_IMAGE_BYTES = 50 * 1024 * 1024;

/** Validate and resolve a library-relative path, preventing directory traversal. */
export function safeLibraryPath(relativePath: string): string | null {
  const root = libraryRoot();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

/**
 * Stream a web ReadableStream to a library file in chunks — never the whole
 * asset in memory, because the hub is often a Raspberry Pi and imports
 * include videos of tens to hundreds of MB. Enforces the byte cap WHILE
 * writing (a Content-Length header can lie or be absent); on overflow or any
 * mid-stream failure the partial file is removed so the library never holds
 * truncated media.
 */
export async function writeLibraryFile(
  filePath: string,
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<void> {
  if (!body) throw new Error('empty response body');
  let written = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      written += chunk.length;
      if (written > maxBytes) callback(new Error(`file exceeds the ${maxBytes} byte limit`));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(body as import('stream/web').ReadableStream),
      cap,
      createWriteStream(filePath),
    );
  } catch (err) {
    await fs.rm(filePath, { force: true }).catch(() => { /* nothing to clean */ });
    throw err;
  }
}
