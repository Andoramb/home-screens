'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

export const CROSSFADE_MS = 500;

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

interface Layer {
  key: number;
  src: string;
}

export interface CrossfadeBackgroundProps {
  src?: string;
  alt?: string;
}

/** Retains the previous media until its replacement loads and fades in. */
export default function CrossfadeBackground({ src, alt = '' }: CrossfadeBackgroundProps) {
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
  const markFailed = (key: number) =>
    setLayers((prev) => prev.filter((layer) => layer.key !== key));

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
            onError={() => markFailed(layer.key)}
            style={style}
          />
        ) : (
          <img
            key={layer.key}
            src={layer.src}
            alt={alt}
            onLoad={() => markLoaded(layer.key)}
            onError={() => markFailed(layer.key)}
            style={style}
          />
        );
      })}
    </>
  );
}
