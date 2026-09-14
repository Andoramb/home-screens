import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import {
  THUMBNAIL_DIR,
  canThumbnail,
  removeThumbnails,
  thumbnailPath,
  thumbnailWidth,
} from '@/lib/thumbnails';

let tmpDir: string;
let origCwd: () => string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbs-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writePng(name: string, width: number, height: number): Promise<string> {
  const abs = path.join(tmpDir, name);
  await fs.writeFile(abs, await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  }).png().toBuffer());
  return abs;
}

async function cacheEntries(): Promise<string[]> {
  return fs.readdir(path.join(tmpDir, THUMBNAIL_DIR)).catch(() => []);
}

describe('thumbnailWidth', () => {
  it('accepts only the listed widths', () => {
    expect(thumbnailWidth('480')).toBe(480);
    expect(thumbnailWidth('320')).toBe(320);
    expect(thumbnailWidth('481')).toBeNull();
    expect(thumbnailWidth('4000')).toBeNull();
    expect(thumbnailWidth('abc')).toBeNull();
    expect(thumbnailWidth(null)).toBeNull();
  });
});

describe('canThumbnail', () => {
  it('resizes raster formats and leaves gif and svg whole', () => {
    expect(canThumbnail('a.jpg')).toBe(true);
    expect(canThumbnail('nature/a.PNG')).toBe(true);
    expect(canThumbnail('a.webp')).toBe(true);
    expect(canThumbnail('a.gif')).toBe(false);
    expect(canThumbnail('a.svg')).toBe(false);
    expect(canThumbnail('clip.mp4')).toBe(false);
  });
});

describe('thumbnailPath', () => {
  it('writes a WebP no wider than asked and reuses it on the next call', async () => {
    const abs = await writePng('big.png', 1600, 800);

    const first = await thumbnailPath(abs, 'big.png', 480);
    const meta = await sharp(first).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(480);
    expect(meta.height).toBe(240);
    expect(first.startsWith(path.join(tmpDir, THUMBNAIL_DIR))).toBe(true);

    const before = await fs.stat(first);
    const second = await thumbnailPath(abs, 'big.png', 480);
    expect(second).toBe(first);
    expect((await fs.stat(second)).mtimeMs).toBe(before.mtimeMs);
    expect(await cacheEntries()).toHaveLength(1);
  });

  it('never enlarges a picture smaller than the requested width', async () => {
    const abs = await writePng('small.png', 200, 100);
    const meta = await sharp(await thumbnailPath(abs, 'small.png', 480)).metadata();
    expect(meta.width).toBe(200);
  });

  it('replaces the copy when the original changes and prunes the stale one', async () => {
    const abs = await writePng('pic.png', 800, 800);
    const first = await thumbnailPath(abs, 'pic.png', 320);

    // A different file under the same name: new size, new mtime.
    await fs.writeFile(abs, await sharp({
      create: { width: 900, height: 300, channels: 3, background: '#3355ff' },
    }).png().toBuffer());
    const later = new Date(Date.now() + 5000);
    await fs.utimes(abs, later, later);

    const second = await thumbnailPath(abs, 'pic.png', 320);
    expect(second).not.toBe(first);
    expect((await sharp(second).metadata()).height).toBe(107);
    expect(await cacheEntries()).toEqual([path.basename(second)]);
  });

  it('keeps separate widths side by side and removes them all on delete', async () => {
    const abs = await writePng('multi.png', 1000, 1000);
    await thumbnailPath(abs, 'multi.png', 320);
    await thumbnailPath(abs, 'multi.png', 640);
    expect(await cacheEntries()).toHaveLength(2);

    await removeThumbnails('multi.png');
    expect(await cacheEntries()).toHaveLength(0);
    // Deleting a file that never had copies is a no-op, not an error.
    await expect(removeThumbnails('never.png')).resolves.toBeUndefined();
  });

  it('throws for a file sharp cannot decode, leaving nothing behind', async () => {
    const abs = path.join(tmpDir, 'bad.jpg');
    await fs.writeFile(abs, 'not an image');
    await expect(thumbnailPath(abs, 'bad.jpg', 480)).rejects.toThrow();
    expect(await cacheEntries()).toHaveLength(0);
  });
});
