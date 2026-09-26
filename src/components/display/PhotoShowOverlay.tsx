'use client';

import { useEffect, useState } from 'react';
import { usePhotoShowStore } from '@/stores/photo-show-store';
import { useAuthImageState } from './useAuthImage';
import { DISPLAY_LAYERS } from '@/lib/display-layers';
import { displaySizedUrl } from '@/lib/media-paths';

/**
 * A photo sent from a phone with "Show on the wall": the whole picture on
 * black, over whatever screen is up, until its time runs out or someone taps
 * it. Rotation carries on underneath, so the wall is where it would have been
 * when the photo goes. Same stacking as the timer takeover (later in the
 * DOM, so it paints above it); alerts still come out on top.
 */
export default function PhotoShowOverlay({ viewport }: { viewport?: { w: number; h: number } }) {
  const photo = usePhotoShowStore((s) => s.photo);
  const hide = usePhotoShowStore((s) => s.hide);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const box = viewport && viewport.w > 0 ? { w: viewport.w * dpr, h: viewport.h * dpr } : undefined;
  const imageSrc = photo?.kind === 'image' ? displaySizedUrl(photo.url, box) : undefined;
  // Never the previous photo's picture while the new one loads.
  const { url, status } = useAuthImageState(imageSrc, { holdPrevious: false });

  // Fade in once the picture (or the video's first frame) is there.
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(false), [photo?.id]);
  useEffect(() => {
    if (photo?.kind === 'image' && status === 'ready') setShown(true);
    // A picture that cannot be fetched is not worth a black screen.
    if (photo?.kind === 'image' && status === 'failed') hide();
  }, [photo, status, hide]);

  if (!photo) return null;
  return (
    <div
      data-testid="photo-show"
      onClick={hide}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: DISPLAY_LAYERS.photo,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        opacity: shown ? 1 : 0,
        transition: 'opacity 400ms ease-out',
        // Out of the screen-rotation view transition, like the timer takeover
        // (paired with the ::view-transition rules in globals.css).
        viewTransitionName: 'photo-show',
      }}
    >
      {photo.kind === 'video' ? (
        <video
          key={photo.id}
          src={photo.url}
          autoPlay
          muted
          playsInline
          onPlaying={() => setShown(true)}
          onEnded={hide}
          onError={hide}
          style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
        />
      ) : (
        url && (
          <img
            key={photo.id}
            src={url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        )
      )}
    </div>
  );
}
