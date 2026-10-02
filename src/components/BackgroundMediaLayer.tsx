'use client';

import type { BackgroundShade } from '@/types/config';
import CrossfadeBackground from '@/components/display/CrossfadeBackground';
import BackgroundShadeOverlay from '@/components/BackgroundShadeOverlay';

/** Keeps the shade above media but below every widget, regardless of widget z-index. */
export default function BackgroundMediaLayer({ src, shade, authenticate = false }: { src?: string; shade?: BackgroundShade; authenticate?: boolean }) {
  return (
    <div data-testid="background-media-layer" style={{ position: 'absolute', inset: 0, zIndex: -1, isolation: 'isolate', pointerEvents: 'none' }}>
      <CrossfadeBackground src={src} authenticate={authenticate} />
      <BackgroundShadeOverlay shade={shade} />
    </div>
  );
}
