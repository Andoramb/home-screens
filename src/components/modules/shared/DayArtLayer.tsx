'use client';

import type { CSSProperties } from 'react';
import { useAuthImage } from '@/components/display/useAuthImage';
import type { DayDecor } from '@/lib/calendar-rules';

/**
 * Day-rule art painted as its own layer inside the cell: the cell
 * background renders exactly as a decor-free cell, this layer sits above
 * it at z-index -1, and every in-flow child (digits, event pills) paints
 * over the art. `mergeCellDecor` makes the cell the stacking context and
 * positioned anchor that keeps a negative z-index inside it. Element
 * opacity, not a scrim in the background stack, carries Art dimming, so
 * the dimming is per-pixel: opaque art fades toward whatever is
 * underneath, transparent pixels change nothing. Both calendar modules
 * render this wherever a day cell carries decor.
 *
 * Scale and position ride the inner painter. At the default size (100)
 * the art is painted with `cover`, exactly as before the size control
 * existed: cover scales by whichever axis needs more, so it always reaches
 * all four cell edges whatever the art's aspect. Only a size below 100
 * opts into the axis-bound rule (data-day-art-scaled): the layer is a size
 * container (globals.css; its box is inset-driven, so size containment is
 * free), and the art binds to the cell's longer axis at --day-art-scale
 * percent. Binding to one axis is not cover, so it must never be the
 * default: 3:2 art in a 1.4:1 landscape cell leaves bands at "100%".
 * background-position percentages natively mean 0% = left/top edges
 * aligned, 100% = right/bottom edges, 50% = centered. Everything about
 * blending (element opacity, z-index -1, rounding) stays on the layer.
 *
 * Uploaded art lives behind the media-library serve route, which a CSS
 * background request cannot authenticate against on a password-protected
 * wall, so the URL goes through `useAuthImage` like every other API-served
 * image on the display (a blob URL once fetched with the display token;
 * built-in /starter-day-art paths pass straight through).
 */
export function DayArtLayer({ decor }: { decor: DayDecor }) {
  const src = useAuthImage(decor.backgroundImage);
  if (!src) return null;
  const scale = decor.backgroundScale ?? 100;
  const x = decor.backgroundPositionX ?? 50;
  const y = decor.backgroundPositionY ?? 50;
  return (
    <div
      data-day-art=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        zIndex: -1,
        // Inherit the cell's rounding so cover art cannot poke out square
        // corners (no border-radius = inherit 0).
        borderRadius: 'inherit',
        // Slider values step by 5%, so rounding away float dust (1 - 0.7)
        // is lossless and keeps the emitted style readable.
        opacity: Math.round((1 - (decor.backgroundDim ?? 0.4)) * 100) / 100,
      }}
    >
      <div
        data-day-art-image=""
        data-day-art-scaled={scale < 100 ? '' : undefined}
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${src}")`,
          backgroundPosition: `${x}% ${y}%`,
          borderRadius: 'inherit',
          ...(scale < 100 ? { '--day-art-scale': String(scale) } : {}),
        } as CSSProperties}
      />
    </div>
  );
}
