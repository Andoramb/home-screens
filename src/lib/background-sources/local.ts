import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { safeLibraryPath } from '@/lib/library-files';
import { IMAGE_FILE_RE } from '@/lib/media-formats';
import type { BackgroundRotation } from '@/types/config';
import type { BackgroundSourceProvider } from './types';

async function pickLocalPhoto(rotation: BackgroundRotation): Promise<string | null> {
  const dir = rotation.localFolder ? safeLibraryPath(rotation.localFolder) : path.join(process.cwd(), BACKGROUNDS_DIR);
  if (!dir) return null;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const images = entries.filter((e) => e.isFile() && IMAGE_FILE_RE.test(e.name)).map((e) => e.name);
  if (images.length === 0) return null;

  const name = images[Math.floor(Math.random() * images.length)];
  const filePath = rotation.localFolder ? `${rotation.localFolder}/${name}` : name;
  return `/api/backgrounds/serve?file=${encodeURIComponent(filePath)}`;
}

export const localSourceProvider: BackgroundSourceProvider = {
  id: 'local',
  fetchRandom: pickLocalPhoto,
};
