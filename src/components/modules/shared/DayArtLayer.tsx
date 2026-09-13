'use client';

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
 * Uploaded art lives behind the media-library serve route, which a CSS
 * background request cannot authenticate against on a password-protected
 * wall, so the URL goes through `useAuthImage` like every other API-served
 * image on the display (a blob URL once fetched with the display token;
 * built-in /starter-day-art paths pass straight through).
 */
export function DayArtLayer({ decor }: { decor: DayDecor }) {
  const src = useAuthImage(decor.backgroundImage);
  if (!src) return null;
  return (
    <div
      data-day-art=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `url("${src}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        zIndex: -1,
        // Inherit the cell's rounding so cover art cannot poke out square
        // corners (no border-radius = inherit 0).
        borderRadius: 'inherit',
        // Slider values step by 5%, so rounding away float dust (1 - 0.7)
        // is lossless and keeps the emitted style readable.
        opacity: Math.round((1 - (decor.backgroundDim ?? 0.4)) * 100) / 100,
      }}
    />
  );
}
