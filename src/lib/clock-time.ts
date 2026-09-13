/**
 * Wall-clock time formatting shared by every surface that shows a time of day
 * as text: meal serving times, school bell schedules, and anything else that
 * stores a plain 'HH:MM' string rather than a real instant.
 *
 * Deliberately NOT localized. The day period renders as the English 'AM' /
 * 'PM' in every locale, which is what these surfaces have always shipped and
 * what their layouts are sized for. A surface that formats a real `Date` and
 * wants the locale's own day period should use `formatEventTime` from
 * `@/lib/calendar-utils` instead, which goes through date-fns.
 *
 * This is separate from `@/lib/time-format`, which handles durations and
 * relative ages ("5s ago", "2h 30m") rather than clock times.
 */

import { DEFAULT_TIME_FORMAT, type TimeFormat } from '@/types/config';

/** Minutes in a day. A valid time of day is 0 up to but not including this. */
const MINUTES_PER_DAY = 24 * 60;

/**
 * Parse an 'HH:MM' 24-hour string to minutes from midnight, or null when it is
 * missing or malformed. Range-checks both parts, so '25:00' and '12:60' are
 * rejected rather than silently wrapping.
 *
 * Internal: the exported entry points are the two formatters. Callers that
 * need the number for arithmetic (window membership, sorting a bell schedule)
 * use `parseTimeToMinutes` from `@/lib/sleep-timeline`, which accepts the same
 * strings.
 */
function toMinutes(time: string | undefined | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Format minutes from midnight for display. Returns an empty string for
 * anything outside a single day, so callers can render the result directly.
 *
 * Examples:
 *   formatClockMinutes(1110, '12h') -> '6:30 PM'
 *   formatClockMinutes(1110, '24h') -> '18:30'
 *   formatClockMinutes(0, '12h')    -> '12:00 AM'
 */
export function formatClockMinutes(
  minutes: number | undefined | null,
  format: TimeFormat = DEFAULT_TIME_FORMAT,
): string {
  if (typeof minutes !== 'number' || !Number.isInteger(minutes)) return '';
  if (minutes < 0 || minutes >= MINUTES_PER_DAY) return '';

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const mm = String(m).padStart(2, '0');

  if (format === '24h') {
    return `${String(h).padStart(2, '0')}:${mm}`;
  }
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

/**
 * Format an 'HH:MM' 24-hour string for display, honoring the household's
 * clock preference. Returns an empty string for missing or invalid input.
 *
 * Examples:
 *   formatClockTime('18:30', '12h') -> '6:30 PM'
 *   formatClockTime('18:30', '24h') -> '18:30'
 *   formatClockTime('07:00', '12h') -> '7:00 AM'
 */
export function formatClockTime(
  time: string | undefined | null,
  format: TimeFormat = DEFAULT_TIME_FORMAT,
): string {
  return formatClockMinutes(toMinutes(time), format);
}

/**
 * Effective clock format for one surface: an explicit per-surface override
 * wins, otherwise the household global, otherwise 12h. Every caller resolves
 * through this so "follow the household setting" means the same thing
 * everywhere.
 */
export function resolveTimeFormat(
  override: TimeFormat | undefined | null,
  global: TimeFormat | undefined | null,
): TimeFormat {
  return override ?? global ?? DEFAULT_TIME_FORMAT;
}
