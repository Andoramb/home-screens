import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { imageSize } from 'image-size';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { readConfig } from '@/lib/config';
import { scanMediaUsage } from '@/lib/media-usage';
import { withAuth } from '@/lib/api-utils';
import type {
  MediaInventory,
  MediaInventoryDirectory,
  MediaInventoryItem,
} from '@/lib/media-inventory';

export const dynamic = 'force-dynamic';

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

const IMAGE_RE = /\.(jpe?g|jfif|pjpeg|pjp|png|webp|gif|avif|svg)$/i;
const VIDEO_RE = /\.(mp4|webm|mov)$/i;

/**
 * First stage of dimension reading: sane files carry their headers in the
 * first few KiB, so probe only this much instead of buffering whole phone
 * JPEGs (a library of those would cost the Pi seconds of disk per page open).
 */
const HEADER_PROBE_BYTES = 64 * 1024;

/** Stable output order regardless of readdir ordering. */
function byPath<T extends { path: string }>(a: T, b: T): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function dimensionsOf(dims: {
  width: number | undefined;
  height: number | undefined;
}): { width: number; height: number } | undefined {
  const { width, height } = dims;
  return typeof width === 'number' && Number.isFinite(width)
    && typeof height === 'number' && Number.isFinite(height)
    ? { width, height }
    : undefined;
}

/**
 * Two-stage dimension read. Stage one reads only the first 64 KiB —
 * dimension headers live in the first few KiB of sane files, so buffering
 * whole phone JPEGs would hammer the Pi's disk for seconds per page open.
 * A stage-one throw usually means truncation: the dimension info sits past
 * the probe (e.g. a fat EXIF segment pushing the JPEG's SOF marker out),
 * so stage two retries once against the whole file. A stage-two throw means
 * the file is genuinely corrupt, and the caller ships it without dimensions.
 */
async function readImageDimensions(
  full: string,
): Promise<{ width: number; height: number } | undefined> {
  try {
    const fh = await fs.open(full, 'r');
    try {
      const buf = Buffer.alloc(HEADER_PROBE_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HEADER_PROBE_BYTES, 0);
      return dimensionsOf(imageSize(buf.subarray(0, bytesRead)));
    } finally {
      await fh.close();
    }
  } catch {
    try {
      return dimensionsOf(imageSize(await fs.readFile(full)));
    } catch {
      return undefined;
    }
  }
}

/**
 * Walk the library two folder levels deep (root files, subfolder files, and
 * one nesting below that — the same shape `scanDirectories` covers). Every
 * image-or-video file becomes an item; every subfolder becomes a directory
 * entry counting its direct media files, empty folders included. A missing
 * or unreadable folder contributes nothing rather than failing the request.
 */
async function walkLibrary(): Promise<Pick<MediaInventory, 'items' | 'directories'>> {
  const items: MediaInventoryItem[] = [];
  const directories: MediaInventoryDirectory[] = [];

  /** Scan one folder; returns its direct image-or-video file count. */
  async function scan(dir: string, rel: string, depth: number): Promise<number> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    let count = 0;
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      let stat;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        // Folders live at most two deep; a third level is never listed.
        if (depth >= 2) continue;
        const relDir = rel ? `${rel}/${entry.name}` : entry.name;
        const subCount = await scan(full, relDir, depth + 1);
        directories.push({ name: entry.name, path: relDir, count: subCount });
        continue;
      }
      if (!stat.isFile()) continue;
      const isImage = IMAGE_RE.test(entry.name);
      const isVideo = VIDEO_RE.test(entry.name);
      if (!isImage && !isVideo) continue;
      count++;
      const item: MediaInventoryItem = {
        path: rel ? `${rel}/${entry.name}` : entry.name,
        kind: isImage ? 'image' : 'video',
        bytes: stat.size,
      };
      if (isImage) {
        const dims = await readImageDimensions(full);
        if (dims) {
          item.width = dims.width;
          item.height = dims.height;
        }
      }
      items.push(item);
    }
    return count;
  }

  await scan(BGS, '', 0);
  items.sort(byPath);
  directories.sort(byPath);
  return { items, directories };
}

export const GET = withAuth(async () => {
  const { items, directories } = await walkLibrary();

  // Only paths that exist in the library can be "in use", so the known-path
  // set comes straight from the walk.
  const config = await readConfig();
  const usageMap = scanMediaUsage(config, new Set(items.map((item) => item.path)));
  const usage: MediaInventory['usage'] = {};
  for (const [p, uses] of usageMap) usage[p] = uses;

  const inventory: MediaInventory = { items, directories, usage };
  return NextResponse.json(inventory);
}, 'Failed to build media inventory');
