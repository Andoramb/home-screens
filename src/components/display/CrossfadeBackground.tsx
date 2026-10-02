'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

/** Fade duration for a background image/video change. */
export const CROSSFADE_MS = 500;

/** Video file extensions the resolved background path may carry; anything
 *  else is rendered as an image. Checked on the path, not a fetched
 *  content-type, since both the display and editor paths only ever have the
 *  URL to go on here. */
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

interface Layer {
  key: number;
  src: string;
}

export interface CrossfadeBackgroundProps {
  /** Resolved background URL, or undefined/empty to render nothing. */
  src?: string;
  alt?: string;
  /** Fired when a layer's image/video fails to load — same signal the old
   *  single-<img> `onError` gave callers, to drive the "missing file, fall
   *  back to solid color" treatment. */
  onError?: (src: string) => void;
}

/**
 * Crossfades between successive backgrounds: the previous layer stays
 * mounted underneath (full-bleed, `objectFit: cover`) while the next one
 * loads invisibly on top, then fades in over CROSSFADE_MS once loaded — so a
 * slow fetch never shows a blank gap, and a change never hard-cuts. The old
 * layer is dropped once the fade completes. A path ending in a video
 * extension renders as a looping, muted, autoplaying `<video>` with the same
 * layering instead of an `<img>`.
 */
export default function CrossfadeBackground({ src, alt = '', onError }: CrossfadeBackgroundProps) {
  const [layers, setLayers] = useState<Layer[]>(() => (src ? [{ key: 0, src }] : []));
  const [loadedKeys, setLoadedKeys] = useState<ReadonlySet<number>>(new Set());
  const nextKey = useRef(1);

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (!src) return [];
      if (top?.src === src) return prev;
      return [...prev, { key: nextKey.current++, src }];
    });
  }, [src]);

  // Once the newest layer has loaded, drop every layer below it after the
  // fade finishes — they were only kept mounted to avoid a gap underneath it.
  useEffect(() => {
    const top = layers[layers.length - 1];
    if (!top || layers.length <= 1 || !loadedKeys.has(top.key)) return;
    const id = setTimeout(() => {
      setLayers((prev) => (prev.length > 1 ? [prev[prev.length - 1]] : prev));
    }, CROSSFADE_MS);
    return () => clearTimeout(id);
  }, [layers, loadedKeys]);

  const markLoaded = (key: number) =>
    setLoadedKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  return (
    <>
      {layers.map((layer, i) => {
        const isTop = i === layers.length - 1;
        const loaded = loadedKeys.has(layer.key);
        const style: CSSProperties = {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // The top layer starts invisible and fades in once loaded; every
          // layer below it was already the (visible) top layer before.
          opacity: isTop ? (loaded ? 1 : 0) : 1,
          transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
          zIndex: isTop ? 1 : 0,
        };
        return VIDEO_EXT_RE.test(layer.src) ? (
          <video
            key={layer.key}
            src={layer.src}
            autoPlay
            muted
            loop
            playsInline
            onLoadedData={() => markLoaded(layer.key)}
            onError={() => onError?.(layer.src)}
            style={style}
          />
        ) : (
          <img
            key={layer.key}
            src={layer.src}
            alt={alt}
            onLoad={() => markLoaded(layer.key)}
            onError={() => onError?.(layer.src)}
            style={style}
          />
        );
      })}
    </>
  );
}
