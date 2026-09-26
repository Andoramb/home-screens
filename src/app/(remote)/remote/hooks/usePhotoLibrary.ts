'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import type { MediaInventory } from '@/lib/media-inventory';

/**
 * The whole media library in one read (`/api/backgrounds/inventory`): every
 * file with its kind, size and date, every folder (empty ones too), where
 * each file is used, the slideshows on the walls, and the space left. The
 * Photos tab filters it by folder on the phone.
 *
 * `refresh` may be called while an earlier read is still out (an upload
 * finishing while a delete refreshes): only the newest answer lands.
 */
export function usePhotoLibrary() {
  const [inventory, setInventory] = useState<MediaInventory | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const latestRef = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++latestRef.current;
    try {
      const res = await editorFetch('/api/backgrounds/inventory');
      if (id !== latestRef.current) return;
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      const next = (await res.json()) as MediaInventory;
      if (id !== latestRef.current) return;
      setInventory(next);
      setLoadFailed(false);
    } catch (err) {
      if (id !== latestRef.current || isSessionExpired(err)) return;
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { inventory, loadFailed, refresh };
}
