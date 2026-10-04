import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { readImageDimensions } from '../image-dimensions';

let dir: string;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-dimensions-'));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function write(name: string, orientation?: number): Promise<{ file: string; size: number }> {
  const file = path.join(dir, name);
  let image = sharp({ create: { width: 60, height: 30, channels: 3, background: '#39c' } });
  if (orientation) image = image.withMetadata({ orientation });
  await image.jpeg().toFile(file);
  return { file, size: (await fs.stat(file)).size };
}

describe('readImageDimensions', () => {
  it('reads the stored size of an upright picture', async () => {
    const { file, size } = await write('upright.jpg');
    expect(await readImageDimensions(file, size)).toEqual({ width: 60, height: 30 });
  });

  it('turns width and height round for a picture stored on its side', async () => {
    for (const orientation of [5, 6, 7, 8]) {
      const { file, size } = await write(`turned-${orientation}.jpg`, orientation);
      expect(await readImageDimensions(file, size), `orientation ${orientation}`).toEqual({ width: 30, height: 60 });
    }
  });

  it('keeps the stored size for the upside-down and mirrored orientations', async () => {
    for (const orientation of [2, 3, 4]) {
      const { file, size } = await write(`flipped-${orientation}.jpg`, orientation);
      expect(await readImageDimensions(file, size), `orientation ${orientation}`).toEqual({ width: 60, height: 30 });
    }
  });

  it('gives nothing for a file that is not a picture', async () => {
    const file = path.join(dir, 'notes.jpg');
    await fs.writeFile(file, 'not a picture');
    expect(await readImageDimensions(file, 13)).toBeUndefined();
  });
});
