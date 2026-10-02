import { getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { fetchWithTimeout } from '@/lib/api-utils';
import { isUnsplashCollectionsMode } from '@/lib/unsplash-rotation-mode';
import { saveRotationFile } from './save';
import type { BackgroundRotation } from '@/types/config';
import type { BackgroundSourceProvider, Canvas } from './types';

function orientationFor(canvas: Canvas | undefined): string | undefined {
  if (!canvas) return undefined;
  if (canvas.w > canvas.h * 1.1) return 'landscape';
  if (canvas.h > canvas.w * 1.1) return 'portrait';
  return 'squarish';
}

async function fetchAndSavePhoto(rotation: BackgroundRotation, canvas: Canvas | undefined): Promise<string | null> {
  const accessKey = await getUnsplashAccessKey();
  if (!accessKey) return null;

  const orientation = orientationFor(canvas);
  const useCollections = isUnsplashCollectionsMode(rotation);
  const base = useCollections
    ? `collections=${rotation.unsplashCollections!.map((id) => encodeURIComponent(id)).join(',')}`
    : `query=${encodeURIComponent(rotation.query)}`;
  const orientationParam = orientation ? `&orientation=${orientation}` : '';

  const res = await fetchWithTimeout(
    `https://api.unsplash.com/photos/random?${base}&content_filter=high${orientationParam}`,
    { headers: { Authorization: `Client-ID ${accessKey}` } },
  );
  if (!res.ok) return null;

  const photo = await res.json();
  const raw: string | undefined = photo.urls?.raw;
  const imageUrl = raw && canvas
    ? `${raw}${raw.includes('?') ? '&' : '?'}fit=crop&w=${canvas.w}&h=${canvas.h}&q=80&fm=jpg`
    : photo.urls?.regular;
  const photoId = photo.id;
  if (!imageUrl || !photoId) return null;

  const downloadLocation = photo.links?.download_location;
  if (downloadLocation) trackDownload(downloadLocation, accessKey);

  const imgRes = await fetchWithTimeout(imageUrl);
  if (!imgRes.ok) return null;

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  return saveRotationFile(`rotation-unsplash-${photoId}.jpg`, buffer);
}

export const unsplashSourceProvider: BackgroundSourceProvider = {
  id: 'unsplash',
  fetchRandom: fetchAndSavePhoto,
};
