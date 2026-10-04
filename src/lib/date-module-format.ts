import { dayMonthPattern, fullDatePattern } from '@/i18n';

/**
 * The pattern the Date module writes a date with, in the household's language.
 *
 * The format presets are stored as date-fns patterns in English order
 * (`MMMM d`), and were printed as stored: a German wall read "September 29"
 * beside a clock that read "29. September". A preset names a kind of date
 * ("month and day"), so it is written the way `locale` writes that kind of
 * date. A pattern typed by hand, and the all-number presets, say exactly what
 * they want and are used as they are.
 *
 * English gets back the pattern it gave, so nothing changes there. The wall
 * and the editor's preview both come through here.
 */
export function dateModulePattern(pattern: string, locale: string): string {
  const long = dayMonthPattern(locale, 'long');
  const short = dayMonthPattern(locale, 'short');
  switch (pattern) {
    case 'MMMM d':
      return long;
    case 'EEEE, MMMM d':
      return fullDatePattern(locale, 'long');
    case 'EEE, MMM d':
      return `EEE, ${short}`;
    case 'MMMM d, yyyy':
      return long === 'MMMM d' ? pattern : `${long} yyyy`;
    case 'MMM d, yyyy':
      return short === 'MMM d' ? pattern : `${short} yyyy`;
    default:
      return pattern;
  }
}
