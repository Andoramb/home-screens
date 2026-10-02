'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAuthImageState } from './useAuthImage';

export const CROSSFADE_MS = 500;

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

interface Layer {
  key: number;
  src: string;
}

export interface CrossfadeBackgroundProps {
  src?: string;
  alt?: string;
  authenticate?: boolean;
}

/** Retains the previous media until its replacement loads and fades in. */
export default function CrossfadeBackground({ src, alt = '', authenticate = false }: CrossfadeBackgroundProps) {
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

  const markLoaded = useCallback((key: number) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setLoadedKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    }));
  }, []);
  const markFailed = useCallback((key: number) =>
    setLayers((prev) => prev.filter((layer) => layer.key !== key)), []);

  return (
    <>
      {layers.map((layer, i) => (
        <MediaLayer
          key={layer.key}
          layer={layer}
          isTop={i === layers.length - 1}
          loaded={loadedKeys.has(layer.key)}
          alt={alt}
          authenticate={authenticate}
          onLoaded={markLoaded}
          onFailed={markFailed}
        />
      ))}
    </>
  );
}

function MediaLayer({ layer, isTop, loaded, alt, authenticate, onLoaded, onFailed }: {
  layer: Layer;
  isTop: boolean;
  loaded: boolean;
  alt: string;
  authenticate: boolean;
  onLoaded: (key: number) => void;
  onFailed: (key: number) => void;
}) {
  const isVideo = VIDEO_EXT_RE.test(layer.src);
  const auth = useAuthImageState(authenticate && !isVideo ? layer.src : undefined, { holdPrevious: false });
  const src = authenticate && !isVideo ? auth.url : layer.src;
  useEffect(() => {
    if (authenticate && !isVideo && auth.status === 'failed') onFailed(layer.key);
  }, [authenticate, isVideo, auth.status, layer.key, onFailed]);
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
  if (!src) return null;
  return isVideo ? (
    <video src={src} autoPlay muted loop playsInline onLoadedData={() => onLoaded(layer.key)} onError={() => onFailed(layer.key)} style={style} />
  ) : (
    <img src={src} alt={alt} onLoad={() => onLoaded(layer.key)} onError={() => onFailed(layer.key)} style={style} />
  );
}
