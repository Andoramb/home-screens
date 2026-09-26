'use client';

import { useEffect } from 'react';
import { subscribeRevisions } from '@/lib/display-heartbeat';
import { displayCache } from '@/lib/display-cache';
import { isLibraryListUrl } from '@/lib/fetch-keys';

/**
 * Re-reads the wall's slideshow lists when the media library changed (an
 * upload, delete, move, rename or import), instead of waiting for the lists'
 * own 10-minute poll.
 *
 * Each list answer says which library revision it was read at, and every
 * heartbeat names the current one; a list that is behind is re-read. Comparing
 * each list with the revision it was read at, rather than with the first beat
 * this page saw, also catches a photo added while the wall was starting up.
 * A list keeps its old answer until a re-read replaces it, so one whose
 * re-read failed is still behind on the next beats and is asked for again;
 * one no card is showing is dropped instead, and read fresh when one does.
 *
 * A new revision is acted on once it has held for a whole beat. A phone
 * sending twelve photos one after another moves it twelve times, and every
 * re-read that comes back a different length restarts the slideshow from its
 * first picture, so the wall waits for the burst to end and re-reads once.
 */
export function useLibraryRefresh(): void {
  useEffect(() => {
    let pending: string | undefined;
    return subscribeRevisions(({ library }) => {
      if (library === undefined) return;
      // Lists from a hub that does not say their revision are left to their poll.
      const behind = displayCache
        .revisionsWhere(isLibraryListUrl)
        .filter((entry) => entry.revision !== undefined && entry.revision !== library);
      if (behind.length === 0) {
        pending = undefined;
        return;
      }
      if (library !== pending) {
        pending = library;
        return;
      }
      pending = undefined;
      const stale = new Set(behind.map((entry) => entry.url));
      displayCache.refreshWhere((url) => stale.has(url));
    });
  }, []);
}
