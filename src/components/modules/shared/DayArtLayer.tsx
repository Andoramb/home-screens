'use client';

import type { DayDecor } from '@/lib/calendar-rules';

/**
 * Day-rule art painted as its own layer inside the cell, before any
 * content: the cell background renders exactly as a decor-free cell, then
 * this layer covers it. Element opacity — not a scrim in the background
 * stack — carries Art dimming, so the dimming is per-pixel: opaque art
 * fades toward whatever is underneath, transparent pixels change nothing.
 * Both calendar modules render this wherever a day cell carries decor.
 */
export function DayArtLayer({ decor }: { decor: DayDecor }) {
  return (
    <div
      data-day-art=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `url("${decor.backgroundImage}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
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
