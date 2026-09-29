import { promises as fs } from 'fs';
import path from 'path';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { NASA_APOD_API, getNasaApiKey } from '@/lib/nasa';
import { immichFetch } from '@/lib/immich';
import { fetchICloudMedia } from '@/lib/icloud-media';
import { writeLibraryFile, safeLibraryPath } from '@/lib/library-files';
import { MAX_IMPORT_IMAGE_BYTES, IMAGE_FILE_RE } from '@/lib/media-formats';
import { fetchWithTimeout } from '@/lib/api-utils';
import type { BackgroundRotation, BackgroundRotationSourceId } from '@/types/config';

/**
 * One provider per rotation source, behind a shared interface, so the rotate
 * route's dispatch is a lookup instead of an if/else chain keyed on `source`.
 * This is an internal code-organization abstraction only — not the plugin
 * SDK (`@/lib/plugin-loader`), which is for user-installed modules and stays
 * out of this feature entirely.
 */
export interface BackgroundSourceProvider {
  id: BackgroundRotationSourceId;
  /**
   * Fetch (and, for network sources, save into the library) one random
   * photo, returning its serve path, or null when the source has nothing to
   * offer right now (no key, no matching photo, a request failure, ...).
   */
  fetchRandom(rotation: BackgroundRotation, canvas: { w: number; h: number } | undefined): Promise<string | null>;
}

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

async function fetchAndSavePhoto(
  rotation: BackgroundRotation,
  canvas: { w: number; h: number } | undefined,
): Promise<string | null> {
  const accessKey = await getUnsplashAccessKey();
  if (!accessKey) return null;

  // A photo shaped like the wall: a portrait photo on a landscape wall was
  // blown up to fill the width and cropped to a strip.
  const orientation = !canvas
    ? undefined
    : canvas.w > canvas.h * 1.1 ? 'landscape' : canvas.h > canvas.w * 1.1 ? 'portrait' : 'squarish';
  // Collections take priority over a free-text query: `/photos/random` does
  // server-side sampling across every listed collection in one call, which
  // is far more robust than paginating `/collections/{id}/photos` ourselves
  // against a large or edge-case collection.
  const base = rotation.unsplashCollections?.length
    ? `collections=${rotation.unsplashCollections.map((id) => encodeURIComponent(id)).join(',')}`
    : `query=${encodeURIComponent(rotation.query)}`;
  const orientationParam = orientation ? `&orientation=${orientation}` : '';

  // Fetch random photo metadata from Unsplash
  const res = await fetchWithTimeout(
    `https://api.unsplash.com/photos/random?${base}&content_filter=high${orientationParam}`,
    { headers: { Authorization: `Client-ID ${accessKey}` } },
  );
  if (!res.ok) return null;

  const photo = await res.json();
  // `raw` takes Unsplash's resizing parameters, so the download is cropped
  // to the canvas; `regular` is 1080 px wide whatever the wall.
  const raw: string | undefined = photo.urls?.raw;
  const imageUrl = raw && canvas
    ? `${raw}${raw.includes('?') ? '&' : '?'}fit=crop&w=${canvas.w}&h=${canvas.h}&q=80&fm=jpg`
    : photo.urls?.regular;
  const photoId = photo.id;
  if (!imageUrl || !photoId) return null;

  // Trigger download tracking (required by Unsplash API terms)
  const downloadLocation = photo.links?.download_location;
  if (downloadLocation) {
    trackDownload(downloadLocation, accessKey);
  }

  // Download and save locally
  const imgRes = await fetchWithTimeout(imageUrl);
  if (!imgRes.ok) return null;

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const ext = 'jpg';
  const filename = `rotation-unsplash-${photoId}.${ext}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

async function fetchAndSaveApod(): Promise<string | null> {
  const apiKey = await getNasaApiKey();
  if (!apiKey) return null;
  const res = await fetchWithTimeout(`${NASA_APOD_API}?api_key=${apiKey}&thumbs=true`);
  if (!res.ok) return null;

  const apod = await res.json();
  if (apod.media_type !== 'image') return null;

  const imageUrl = apod.hdurl || apod.url;
  if (!imageUrl) return null;

  const imgRes = await fetchWithTimeout(imageUrl, { timeout: 30_000 });
  if (!imgRes.ok) return null;

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const apodContentType = imgRes.headers.get('content-type') ?? '';
  const apodExt = apodContentType.includes('png') ? '.png' : apodContentType.includes('webp') ? '.webp' : '.jpg';
  const dateStr = (apod.date as string || '').replace(/-/g, '');
  const filename = `rotation-nasa-apod-${dateStr}${apodExt}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

async function fetchAndSaveImmichPhoto(rotation: BackgroundRotation): Promise<string | null> {
  // Immich v3 removed `assets` from the album detail response; search/random
  // accepts albumIds on v2+ and handles all filter combinations server-side.
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

  // Download preview-quality image
  const imgRes = await immichFetch(`/api/assets/${assetId}/thumbnail?size=preview`, { timeout: 15_000 });
  if (!imgRes.ok) return null;

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') ?? '';
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
  const filename = `rotation-immich-${assetId}${ext}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

async function fetchAndSaveICloudPhoto(rotation: BackgroundRotation): Promise<string | null> {
  // Backgrounds are photos only — a video can't be a CSS background image.
  const images = (await fetchICloudMedia(rotation.icloudAlbumUrl || '')).filter((item) => item.type === 'image');
  if (images.length === 0) return null;
  const pick = images[Math.floor(Math.random() * images.length)];

  const imgRes = await fetchWithTimeout(pick.url, { timeout: 30_000 });
  if (!imgRes.ok) return null;

  const contentType = imgRes.headers.get('content-type') ?? '';
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
  // Keyed by the photo's stable GUID (like rotation-immich-<assetId>): the
  // serve path must change between rotations or useBackgroundRotation never
  // swaps it. The rotation- prefix keeps these prunable without ever touching
  // user-imported icloud-<guid> files living in the same root.
  const filename = `rotation-icloud-${pick.guid.replace(/[^A-Za-z0-9-]/g, '')}${ext}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  // Stream to disk like the import path — an Apple original can be tens of
  // MB, too much to buffer whole on a Pi hub, and the cap applies mid-stream.
  await writeLibraryFile(filePath, imgRes.body, MAX_IMPORT_IMAGE_BYTES);

  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

/**
 * Pick a random image already in the local media library, under
 * `rotation.localFolder` (empty/unset = the library root). Nothing to fetch
 * or save — the file is already there, so this just points at it, the same
 * way the static picker's Local tab does.
 */
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

/** Every rotation source, keyed by id, for the rotate route's random pick. */
export const backgroundSourceProviders: Record<BackgroundRotationSourceId, BackgroundSourceProvider> = {
  unsplash: {
    id: 'unsplash',
    fetchRandom: (rotation, canvas) => fetchAndSavePhoto(rotation, canvas),
  },
  'nasa-apod': {
    id: 'nasa-apod',
    fetchRandom: () => fetchAndSaveApod(),
  },
  immich: {
    id: 'immich',
    fetchRandom: (rotation) => fetchAndSaveImmichPhoto(rotation),
  },
  icloud: {
    id: 'icloud',
    fetchRandom: (rotation) => fetchAndSaveICloudPhoto(rotation),
  },
  local: {
    id: 'local',
    fetchRandom: (rotation) => pickLocalPhoto(rotation),
  },
};

/**
 * Whether a source has the settings it needs to actually produce a photo.
 * `nasa-apod`, `icloud`, and `local` (root folder) have no required field of
 * their own — `icloudAlbumUrl`/`localFolder` are optional because an empty
 * value has a sensible fallback (icloud-media validates the URL itself;
 * local falls back to the library root).
 */
export function isSourceConfigured(source: BackgroundRotationSourceId, rotation: BackgroundRotation): boolean {
  if (source === 'unsplash') {
    return !!rotation.query || !!rotation.unsplashCollections?.length;
  }
  return true;
}
