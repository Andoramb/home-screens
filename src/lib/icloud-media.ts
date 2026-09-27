import { fetchSharedStreamsAlbum, fetchSharedStreamsAlbumForImport } from './icloud-album';
import { fetchCloudKitAlbum } from './icloud-link';
import { parseICloudAlbumToken, parseICloudSharedAlbumUrl } from './icloud-parse';
import type { ICloudAlbumItem } from './icloud-types';

/**
 * Single entry point for the live iCloud slideshow source. Apple ships two
 * shared-album backends and a pasted link picks which one:
 *   - photos.icloud.com/shared/album/… (iOS 27+) → CloudKit (icloud-link.ts)
 *   - icloud.com/sharedalbum/#…                   → legacy sharedstreams (icloud-album.ts)
 * Both return the same ICloudAlbumItem[] shape, so callers (the /api/icloud/photos
 * route, background rotation) stay backend-agnostic. A missing/malformed link
 * resolves to [] — the slideshow's empty state handles it.
 */
export async function fetchICloudMedia(albumUrlOrToken: string): Promise<ICloudAlbumItem[]> {
  const cloudKitToken = parseICloudSharedAlbumUrl(albumUrlOrToken);
  if (cloudKitToken) return (await fetchCloudKitAlbum(cloudKitToken)) ?? [];

  const legacyToken = parseICloudAlbumToken(albumUrlOrToken);
  return legacyToken ? fetchSharedStreamsAlbum(legacyToken) : [];
}

/**
 * The same read for an import, which has to tell a link that leads nowhere
 * any more (the album was deleted, or sharing was turned off) from an album
 * with nothing in it: null for the first, so the person hears the link is
 * dead rather than that there was nothing new.
 */
export async function fetchICloudMediaForImport(albumUrlOrToken: string): Promise<ICloudAlbumItem[] | null> {
  const cloudKitToken = parseICloudSharedAlbumUrl(albumUrlOrToken);
  if (cloudKitToken) return fetchCloudKitAlbum(cloudKitToken);

  const legacyToken = parseICloudAlbumToken(albumUrlOrToken);
  return legacyToken ? fetchSharedStreamsAlbumForImport(legacyToken) : null;
}
