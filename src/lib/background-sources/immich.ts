import { immichFetch } from '@/lib/immich';
import { saveRotationFile, extFromContentType } from './save';
import type { BackgroundRotation } from '@/types/config';
import type { BackgroundSourceProvider } from './types';

async function fetchAndSaveImmichPhoto(rotation: BackgroundRotation): Promise<string | null> {
  const body: Record<string, unknown> = { type: 'IMAGE', size: 1 };
  if (rotation.immichAlbumId) body.albumIds = [rotation.immichAlbumId];
  if (rotation.immichPersonId) body.personIds = [rotation.immichPersonId];
  if (rotation.immichFavoritesOnly) body.isFavorite = true;

  const res = await immichFetch('/api/search/random', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const assets = await res.json();
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const assetId = assets[0].id as string;

  const imgRes = await immichFetch(`/api/assets/${assetId}/thumbnail?size=preview`, { timeout: 15_000 });
  if (!imgRes.ok) return null;

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const ext = extFromContentType(imgRes.headers.get('content-type') ?? '');
  return saveRotationFile(`rotation-immich-${assetId}${ext}`, buffer);
}

export const immichSourceProvider: BackgroundSourceProvider = {
  id: 'immich',
  fetchRandom: fetchAndSaveImmichPhoto,
};
