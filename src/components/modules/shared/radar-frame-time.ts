import { formatRelativeTime } from '@/i18n';
import type { TranslateFn } from '@/i18n';

/** Within this window of the frame time the chip just says "Now". */
export const FRAME_NOW_WINDOW_S = 90;

/**
 * Past the loop's own span the minute count stops meaning anything ("1,730
 * min. ago" on a stale index), so the chip rolls over to hours.
 */
export const FRAME_HOURS_FROM_MIN = 90;

/**
 * The radar chip's age text for one frame: "Now" around the present, minutes
 * through the loop's two-hour span, hours beyond it. Pure so the thresholds
 * can be pinned at a fixed clock.
 */
export function formatFrameTime(unixTime: number, nowMs: number, t: TranslateFn, locale: string): string {
  const frameMs = unixTime * 1000;
  const ageMs = Math.abs(frameMs - nowMs);
  if (ageMs <= FRAME_NOW_WINDOW_S * 1000) return t('rain-map.now');
  // Minute granularity inside the loop on purpose: past frames are 10
  // minutes apart over ~2 hours, and "1 hr. ago" for three frames in a row
  // says nothing about which one is showing.
  const unit = ageMs > FRAME_HOURS_FROM_MIN * 60_000 ? 'hour' : 'minute';
  return formatRelativeTime(nowMs, frameMs, { locale, numeric: 'always', style: 'short', unit });
}
