/**
 * Locale-aware date / number / relative-time formatters.
 *
 * date-fns drives `formatDate`, with locales lazy-loaded from
 * `date-fns/locale/<tag>` and cached in a Map. `formatNumber` and
 * `formatRelativeTime` use `Intl.NumberFormat` / `Intl.RelativeTimeFormat`
 * directly — no locale data ships with the bundle.
 *
 * `formatDateSync` exists for hot paths where awaiting a dynamic import is
 * not feasible (the clock module's tick handler, for example). It uses the
 * en-US default if the locale's date-fns bundle hasn't been loaded yet —
 * production code should call `preloadDateLocale(tag)` once at provider
 * mount to warm the cache.
 */

import { format as dfFormat } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { logger } from '@/lib/logger';

const log = logger('i18n');

interface DateFormatOpts {
  locale: string;
}

interface NumberFormatOpts extends Intl.NumberFormatOptions {
  locale: string;
}

interface RelativeTimeOpts {
  locale: string;
  numeric?: 'always' | 'auto';
  style?: 'long' | 'short' | 'narrow';
  /** Force one unit instead of picking the largest that fits ("70 min. ago"). */
  unit?: Intl.RelativeTimeFormatUnit;
}

// Intl.RelativeTimeFormat construction is expensive enough to matter on a
// Pi when a label re-renders on an animation loop, so formatters are kept
// per (locale, numeric, style).
const RTF_CACHE = new Map<string, Intl.RelativeTimeFormat>();
function relativeTimeFormatter(locale: string, numeric: 'always' | 'auto', style: 'long' | 'short' | 'narrow'): Intl.RelativeTimeFormat {
  const key = `${locale}|${numeric}|${style}`;
  let rtf = RTF_CACHE.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric, style });
    RTF_CACHE.set(key, rtf);
  }
  return rtf;
}

const LOCALE_CACHE = new Map<string, DateFnsLocale>();
const LOCALE_PENDING = new Map<string, Promise<DateFnsLocale>>();

/**
 * date-fns publishes locales as separate entry points (e.g.
 * `date-fns/locale/de`) that export a single named binding. The binding
 * names are camel-cased (`enUS`, `ptBR`, `de`, `fr`…), so we read the
 * matching property out of the namespace object after `await import()`.
 *
 * Vite/Next can't statically analyze a fully dynamic `import()` argument,
 * but an explicit switch keeps each path tree-shakable and lets the
 * bundler emit one chunk per locale.
 */
async function importDateFnsLocale(tag: string): Promise<DateFnsLocale> {
  switch (tag) {
    case 'en-US': {
      const m = await import('date-fns/locale/en-US');
      return m.enUS;
    }
    case 'de':
    case 'de-DE': {
      const m = await import('date-fns/locale/de');
      return m.de;
    }
    case 'fr':
    case 'fr-FR': {
      const m = await import('date-fns/locale/fr');
      return m.fr;
    }
    case 'es':
    case 'es-ES': {
      const m = await import('date-fns/locale/es');
      return m.es;
    }
    case 'nl':
    case 'nl-NL': {
      const m = await import('date-fns/locale/nl');
      return m.nl;
    }
    case 'pt-BR': {
      const m = await import('date-fns/locale/pt-BR');
      return m.ptBR;
    }
    case 'da':
    case 'da-DK': {
      const m = await import('date-fns/locale/da');
      return m.da;
    }
    default: {
      const m = await import('date-fns/locale/en-US');
      return m.enUS;
    }
  }
}

/**
 * Lazily load and cache the date-fns locale object for `tag`.
 * Concurrent calls for the same tag share a single in-flight import.
 */
export async function preloadDateLocale(tag: string): Promise<DateFnsLocale> {
  const cached = LOCALE_CACHE.get(tag);
  if (cached) return cached;

  const pending = LOCALE_PENDING.get(tag);
  if (pending) return pending;

  const promise = importDateFnsLocale(tag).then((locale) => {
    LOCALE_CACHE.set(tag, locale);
    LOCALE_PENDING.delete(tag);
    return locale;
  }).catch((err) => {
    LOCALE_PENDING.delete(tag);
    throw err;
  });

  LOCALE_PENDING.set(tag, promise);
  return promise;
}

/**
 * Return the cached date-fns locale for `tag`, or `undefined` if it hasn't
 * been preloaded. `formatDateSync` consults this before falling back to en-US.
 */
function getCachedDateLocale(tag: string): DateFnsLocale | undefined {
  return LOCALE_CACHE.get(tag);
}

/**
 * Format `date` against `pattern` using the locale-specific date-fns bundle.
 * Awaits the dynamic locale import on first use; subsequent calls are
 * synchronous-fast (just a Map hit + the date-fns format call).
 */
export async function formatDate(
  date: Date | number,
  pattern: string,
  opts: DateFormatOpts,
): Promise<string> {
  const locale = await preloadDateLocale(opts.locale);
  return dfFormat(date, pattern, { locale });
}

// Warn-once-per-locale latch for formatDateSync cache misses. Same
// pattern as the provider's missing-key warning so a hot tick loop
// doesn't drown the dev console.
const SYNC_CACHE_MISS_WARNINGS = new Set<string>();

/**
 * Synchronous variant of `formatDate`. If the requested locale isn't loaded
 * yet, the en-US default is used (which is statically imported by date-fns).
 *
 * Use this on render-hot paths where awaiting an import would tear the UI;
 * call `preloadDateLocale` once at provider mount so the cache is warm
 * before the first tick.
 *
 * In dev mode, warns once per locale when the cache is missed so callers
 * notice when they forgot to preload the locale.
 */
export function formatDateSync(
  date: Date | number,
  pattern: string,
  opts: DateFormatOpts,
): string {
  const locale = getCachedDateLocale(opts.locale);
  if (locale) {
    return dfFormat(date, pattern, { locale });
  }
  if (process.env.NODE_ENV === 'development' && !SYNC_CACHE_MISS_WARNINGS.has(opts.locale)) {
    SYNC_CACHE_MISS_WARNINGS.add(opts.locale);
    log.warn(
      `formatDateSync: locale "${opts.locale}" not preloaded; ` +
        `falling back to en-US. Call preloadDateLocale("${opts.locale}") at startup.`,
    );
  }
  return dfFormat(date, pattern);
}

/**
 * The date the probe below is read on. Which date it is does not matter, since
 * the day is found by name among the formatted parts rather than by looking
 * for its digits; a day past the twelfth simply keeps the two apart for
 * anyone printing the parts while working on this.
 */
const DAY_PROBE = new Date(Date.UTC(2024, 10, 12));

const DAY_PATTERN_CACHE = new Map<string, string>();

/**
 * The date-fns pattern that writes a day of the month the way `locale` does.
 *
 * Some languages write the day as an ordinal with a point after the number
 * ("Montag, 2. November", "mandag 2. november") and others write the bare
 * number ("Monday, November 2", "lundi 2 novembre"). Rather than keep a list
 * of which language does which, this asks Intl how the locale spells a day
 * beside a month and copies the point when there is one, so a locale nobody
 * here speaks still comes out right.
 *
 * Returns a fragment to compose into a larger pattern: `d` or `d.`.
 */
export function dayOfMonthPattern(locale: string): string {
  const cached = DAY_PATTERN_CACHE.get(locale);
  if (cached) return cached;
  const pattern = probeDayOfMonthPattern(locale);
  DAY_PATTERN_CACHE.set(locale, pattern);
  return pattern;
}

function probeDayOfMonthPattern(locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).formatToParts(DAY_PROBE);
    const dayAt = parts.findIndex((part) => part.type === 'day');
    const after = dayAt < 0 ? undefined : parts[dayAt + 1];
    return after?.type === 'literal' && after.value.startsWith('.') ? 'd.' : 'd';
  } catch {
    // An unusable tag: the bare number is the safe reading in any language.
    return 'd';
  }
}

const DAY_MONTH_PATTERN_CACHE = new Map<string, string>();
const FULL_DATE_PATTERN_CACHE = new Map<string, string>();

/**
 * Literal text, safe to drop into a date-fns pattern.
 *
 * Every letter is a potential token to date-fns, and the separators Intl hands
 * back are full of them: Spanish writes "2 de noviembre", where an unquoted
 * "de" would format as a day of the month followed by a local day of week.
 * Single quotes escape a run, and a literal quote doubles.
 */
function quoteLiteral(text: string): string {
  if (text === '') return '';
  // Only letters mean anything to date-fns, so a space or a comma is carried
  // through as it is. Quoting those too worked but read as `MMMM' 'd`, which is
  // noise in a pattern somebody may have to debug.
  if (!/[a-zA-Z]/.test(text)) return text.replace(/'/g, "''");
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * Build a date-fns pattern by asking Intl how `locale` lays these fields out,
 * and copying its order, separators and connecting words across.
 *
 * This is the whole reason neither of the two patterns below is composed by
 * hand. Which half leads is the language's business (English puts the month
 * first, German the day), and so is the punctuation: English and Spanish put a
 * comma after the weekday and French does not, Spanish and Portuguese join the
 * day to the month with "de". Picking any of that ourselves got some locale
 * wrong, and the one it got wrong was the default.
 */
function patternFromParts(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  monthToken: string,
  fallback: string,
): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).formatToParts(DAY_PROBE);
    if (!parts.some((part) => part.type === 'day') || !parts.some((part) => part.type === 'month')) {
      return fallback;
    }
    // The day token carries the locale's trailing point when it has one, which
    // Intl reports as the start of the following literal rather than as the day.
    const dayToken = dayOfMonthPattern(locale);
    let out = '';
    for (const part of parts) {
      if (part.type === 'weekday') out += 'EEEE';
      else if (part.type === 'month') out += monthToken;
      else if (part.type === 'day') out += dayToken;
      else if (part.type === 'literal') {
        const literal = dayToken.endsWith('.') && part.value.startsWith('.') ? part.value.slice(1) : part.value;
        out += quoteLiteral(literal);
      }
    }
    return out === '' ? fallback : out;
  } catch {
    return fallback;
  }
}

/**
 * The date-fns pattern that writes a day *and its month* the way `locale` does.
 *
 * `dayOfMonthPattern` above settles the trailing point and nothing else, so a
 * caller composing `${dayOfMonthPattern(locale)} MMMM` is choosing day-first for
 * every language - right for most of the ones we ship and wrong for English,
 * which renders "Monday, 2 November" that way.
 *
 * `month` picks the long or the short month name, and it changes more than the
 * name: Spanish writes "2 de noviembre" but "2 nov", so the connector is probed
 * at the width being asked for. Returns a fragment such as `MMMM d`, `d. MMMM`
 * or `d 'de' MMMM`.
 */
export function dayMonthPattern(locale: string, month: 'long' | 'short' = 'long'): string {
  const token = month === 'long' ? 'MMMM' : 'MMM';
  const key = `${locale}\u0000${token}`;
  const cached = DAY_MONTH_PATTERN_CACHE.get(key);
  if (cached) return cached;
  const pattern = patternFromParts(
    locale,
    { day: 'numeric', month },
    token,
    `${dayOfMonthPattern(locale)} ${token}`,
  );
  DAY_MONTH_PATTERN_CACHE.set(key, pattern);
  return pattern;
}

/**
 * The same, with the weekday in front: a whole "Monday, November 2" or
 * "Montag, 2. November", separators and connecting words included.
 */
export function fullDatePattern(locale: string, month: 'long' | 'short' = 'long'): string {
  const token = month === 'long' ? 'MMMM' : 'MMM';
  const key = `${locale}\u0000${token}`;
  const cached = FULL_DATE_PATTERN_CACHE.get(key);
  if (cached) return cached;
  const pattern = patternFromParts(
    locale,
    { weekday: 'long', day: 'numeric', month },
    token,
    `EEEE, ${dayMonthPattern(locale, month)}`,
  );
  FULL_DATE_PATTERN_CACHE.set(key, pattern);
  return pattern;
}

/**
 * Locale-aware number formatting. Forwards every Intl.NumberFormatOptions
 * field through, so callers can do `{ style: 'currency', currency: 'EUR' }`
 * etc. without the helper getting in the way.
 */
export function formatNumber(n: number, opts: NumberFormatOpts): string {
  const { locale, ...rest } = opts;
  return new Intl.NumberFormat(locale, rest).format(n);
}

/**
 * Render a relative time difference (`from` → `to`) — "in 2 days", "5 hours
 * ago", etc. Picks the largest unit that fits, mirroring how MDN's example
 * works. Defaults to `numeric: 'auto'` so en-US shows "yesterday" instead of
 * "1 day ago".
 */
export function formatRelativeTime(
  from: Date | number,
  to: Date | number,
  opts: RelativeTimeOpts,
): string {
  const fromMs = typeof from === 'number' ? from : from.getTime();
  const toMs = typeof to === 'number' ? to : to.getTime();
  const deltaSec = Math.round((toMs - fromMs) / 1000);

  const rtf = relativeTimeFormatter(opts.locale, opts.numeric ?? 'auto', opts.style ?? 'long');
  const abs = Math.abs(deltaSec);

  // Threshold table — picks the largest sensible unit. Numbers come from
  // average lengths so "in 30 days" rolls over to "next month" cleanly.
  const sec = 1;
  const min = 60;
  const hour = 60 * min;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (opts.unit) {
    const per: Record<string, number> = { second: sec, seconds: sec, minute: min, minutes: min, hour, hours: hour, day, days: day, week, weeks: week, month, months: month, year, years: year, quarter: 3 * month, quarters: 3 * month };
    return rtf.format(Math.round(deltaSec / (per[opts.unit] ?? sec)), opts.unit);
  }

  if (abs < min) return rtf.format(Math.round(deltaSec / sec), 'second');
  if (abs < hour) return rtf.format(Math.round(deltaSec / min), 'minute');
  if (abs < day) return rtf.format(Math.round(deltaSec / hour), 'hour');
  if (abs < week) return rtf.format(Math.round(deltaSec / day), 'day');
  if (abs < month) return rtf.format(Math.round(deltaSec / week), 'week');
  if (abs < year) return rtf.format(Math.round(deltaSec / month), 'month');
  return rtf.format(Math.round(deltaSec / year), 'year');
}

/** @internal — for tests. Reset the date-fns locale cache. */
export function __resetFormatterLocaleCacheForTests(): void {
  DAY_PATTERN_CACHE.clear();
  DAY_MONTH_PATTERN_CACHE.clear();
  FULL_DATE_PATTERN_CACHE.clear();
  LOCALE_CACHE.clear();
  LOCALE_PENDING.clear();
  SYNC_CACHE_MISS_WARNINGS.clear();
}
