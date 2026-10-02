import { immichFetch } from '@/lib/immich';
import { saveRotationFile, extFromContentType } from './save';
import type { BackgroundRotation } from '@/types/config';
import type { BackgroundSourceProvider } from './types';

/** Random-search batch size when an exclude-person filter is configured: Immich's
 *  /api/search/random has no native exclude filter, so a larger batch is fetched
 *  and each candidate's tagged faces are checked client-side until one survives. */
const EXCLUDE_BATCH_SIZE = 10;

interface ImmichAssetDetail {
  people?: Array<{ id: string }>;
}

/** True if any face tagged on the asset is in the exclude list. */
async function assetHasExcludedPerson(assetId: string, excludeIds: string[]): Promise<boolean> {
  const res = await immichFetch(`/api/assets/${assetId}`);
  if (!res.ok) return false;
  const detail = await res.json() as ImmichAssetDetail;
  const taggedIds = (detail.people ?? []).map((p) => p.id);
  return taggedIds.some((id) => excludeIds.includes(id));
}

async function fetchAndSaveImmichPhoto(rotation: BackgroundRotation): Promise<string | null> {
  const excludeIds = rotation.immichPersonIdsExclude ?? [];
  const body: Record<string, unknown> = {
    type: 'IMAGE',
    size: excludeIds.length > 0 ? EXCLUDE_BATCH_SIZE : 1,
  };
  if (rotation.immichAlbumIds?.length) body.albumIds = rotation.immichAlbumIds;
  if (rotation.immichPersonIds?.length) body.personIds = rotation.immichPersonIds;
  if (rotation.immichFavoritesOnly) body.isFavorite = true;

  const res = await immichFetch('/api/search/random', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const assets = await res.json();
  if (!Array.isArray(assets) || assets.length === 0) return null;

  // No exclude filter: take the first candidate, same as before. With one,
  // walk the batch and reject any candidate tagged with an excluded person —
  // returning null (not throwing) lets the caller fall through to the
  // cached/fallback background if every candidate in the batch is excluded.
  let assetId: string | null = null;
  if (excludeIds.length === 0) {
    assetId = assets[0].id as string;
  } else {
    for (const asset of assets) {
      if (!(await assetHasExcludedPerson(asset.id, excludeIds))) {
        assetId = asset.id as string;
        break;
      }
    }
    if (!assetId) return null;
  }

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
