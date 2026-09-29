import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';

export const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

export async function saveRotationFile(filename: string, buffer: Buffer): Promise<string> {
  const filePath = path.join(BGS, filename);
  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(filePath, buffer);
  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

export function extFromContentType(contentType: string): string {
  return contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
}
