import { describe, it, expect, beforeEach } from 'vitest';
import {
  dayMonthPattern,
  dayOfMonthPattern,
  formatDate,
  fullDatePattern,
  formatDateSync,
  formatNumber,
  formatRelativeTime,
  preloadDateLocale,
  __resetFormatterLocaleCacheForTests,
} from '@/i18n/formatters';

describe('formatDate', () => {
  beforeEach(() => {
    __resetFormatterLocaleCacheForTests();
  });

  // Use a fixed timestamp so the test is deterministic regardless of TZ.
  // 2024-03-04 10:30 UTC is a Monday — keeps weekday strings stable.
  const fixed = new Date('2024-03-04T10:30:00Z');

  it('en-US: "EEEE, MMMM d" → "Monday, March 4"', async () => {
    const out = await formatDate(fixed, 'EEEE, MMMM d', { locale: 'en-US' });
    expect(out).toBe('Monday, March 4');
  });

  it('de-DE: weekday names are German', async () => {
    const out = await formatDate(fixed, 'EEEE', { locale: 'de-DE' });
    expect(out).toBe('Montag');
  });

  it('fr-FR: weekday names are French', async () => {
    const out = await formatDate(fixed, 'EEEE', { locale: 'fr-FR' });
    expect(out).toBe('lundi');
  });
});

describe('formatDateSync', () => {
  beforeEach(() => {
    __resetFormatterLocaleCacheForTests();
  });

  const fixed = new Date('2024-03-04T10:30:00Z');

  it('falls back to en-US when the locale isn\'t loaded yet', () => {
    // Cache is empty after reset; sync call should still work.
    const out = formatDateSync(fixed, 'EEEE', { locale: 'de-DE' });
    expect(out).toBe('Monday');
  });

  it('uses the cached locale once preloaded', async () => {
    await preloadDateLocale('de-DE');
    const out = formatDateSync(fixed, 'EEEE', { locale: 'de-DE' });
    expect(out).toBe('Montag');
  });
});

describe('dayOfMonthPattern', () => {
  beforeEach(() => {
    __resetFormatterLocaleCacheForTests();
  });

  // 2 November 2026 is the date the school-timetable frames end a holiday on,
  // and a day the locales disagree about how to write.
  const backToSchool = new Date('2026-11-02T12:00:00Z');

  it('gives German and Danish the ordinal point their dates carry', () => {
    expect(dayOfMonthPattern('de-DE')).toBe('d.');
    expect(dayOfMonthPattern('da-DK')).toBe('d.');
  });

  it('leaves the day a bare number where the language writes one', () => {
    for (const locale of ['en-US', 'fr-FR', 'es-ES', 'nl-NL', 'pt-BR']) {
      expect(dayOfMonthPattern(locale)).toBe('d');
    }
  });

  it('reads the language rather than a list, so an unshipped locale is right too', () => {
    // Czech writes "2. listopadu"; nothing in this repo says so.
    expect(dayOfMonthPattern('cs-CZ')).toBe('d.');
  });

  it('falls back to the bare number for a tag Intl cannot read', () => {
    expect(dayOfMonthPattern('not a locale')).toBe('d');
  });

  it('composes into a pattern each language spells its own way', async () => {
    const de = await formatDate(backToSchool, `EEEE, ${dayOfMonthPattern('de-DE')} MMMM`, {
      locale: 'de-DE',
    });
    expect(de).toBe('Montag, 2. November');
    const en = await formatDate(backToSchool, `EEEE, ${dayOfMonthPattern('en-US')} MMMM`, {
      locale: 'en-US',
    });
    expect(en).toBe('Monday, 2 November');
  });
});

describe('formatNumber', () => {
  it('en-US uses comma grouping and period decimals', () => {
    expect(formatNumber(1234567.89, { locale: 'en-US' })).toBe('1,234,567.89');
  });

  it('de-DE uses period grouping and comma decimals', () => {
    // The narrow no-break space character (U+202F) sometimes shows up in
    // de-DE output; either works at the structural level we care about.
    const out = formatNumber(1234567.89, { locale: 'de-DE' });
    expect(out).toMatch(/^1\.234\.567,89$/);
  });

  it('fr-FR uses (narrow no-break) space grouping and comma decimals', () => {
    const out = formatNumber(1234567.89, { locale: 'fr-FR' });
    // Replace any whitespace variant with a regular space for the assertion.
    expect(out.replace(/\s/g, ' ')).toBe('1 234 567,89');
  });

  it('forwards Intl.NumberFormatOptions through', () => {
    const out = formatNumber(0.42, { locale: 'en-US', style: 'percent' });
    expect(out).toBe('42%');
  });
});

describe('formatRelativeTime', () => {
  it('returns "now" for the same instant (en-US, numeric: auto)', () => {
    const t = Date.now();
    expect(formatRelativeTime(t, t, { locale: 'en-US' })).toBe('now');
  });

  it('returns the German "jetzt" for the same instant in de-DE', async () => {
    // Preload so the test is deterministic regardless of where it runs in
    // the suite. `Intl.RelativeTimeFormat` is part of the platform — no
    // date-fns dependency needed — but the preload also covers any future
    // formatter that does need the locale bundle warmed up.
    await preloadDateLocale('de-DE');
    const t = Date.now();
    expect(formatRelativeTime(t, t, { locale: 'de-DE' })).toBe('jetzt');
  });

  it('+1h returns "in 1 hour" (en-US, numeric: always)', () => {
    const from = new Date('2024-01-01T00:00:00Z').getTime();
    const to = from + 60 * 60 * 1000;
    const out = formatRelativeTime(from, to, { locale: 'en-US', numeric: 'always' });
    expect(out).toBe('in 1 hour');
  });

  it('-1d returns "yesterday" with numeric: auto', () => {
    const to = new Date('2024-01-02T12:00:00Z').getTime();
    const from = to + 24 * 60 * 60 * 1000;
    const out = formatRelativeTime(from, to, { locale: 'en-US', numeric: 'auto' });
    expect(out).toBe('yesterday');
  });

  it('-1d returns "1 day ago" with numeric: always', () => {
    const to = new Date('2024-01-02T12:00:00Z').getTime();
    const from = to + 24 * 60 * 60 * 1000;
    const out = formatRelativeTime(from, to, { locale: 'en-US', numeric: 'always' });
    expect(out).toBe('1 day ago');
  });
});

describe('dayMonthPattern and fullDatePattern', () => {
  beforeEach(() => {
    __resetFormatterLocaleCacheForTests();
  });

  const fixed = new Date('2026-11-02T12:00:00Z');

  /** What the locale itself would write, which is the answer to match. */
  const intl = (locale: string, weekday: boolean) =>
    new Intl.DateTimeFormat(locale, {
      ...(weekday ? { weekday: 'long' as const } : {}),
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(fixed);

  // Composing `${dayOfMonthPattern(locale)} MMMM` by hand chose day-first for
  // every language, so the default locale rendered "Monday, 2 November".
  // Which half leads, the separator after the weekday, and the "de" some
  // languages join with are all the language's own business.
  for (const locale of ['en-US', 'de-DE', 'fr-FR', 'es-ES', 'nl-NL', 'pt-BR', 'da-DK']) {
    it(`${locale}: writes the day and month the way the locale does`, async () => {
      await preloadDateLocale(locale);
      expect(formatDateSync(fixed, dayMonthPattern(locale), { locale })).toBe(intl(locale, false));
    });

    it(`${locale}: writes the weekday, day and month the way the locale does`, async () => {
      await preloadDateLocale(locale);
      expect(formatDateSync(fixed, fullDatePattern(locale), { locale })).toBe(intl(locale, true));
    });
  }

  it('puts the month first for English and the day first for German', () => {
    expect(dayMonthPattern('en-US')).toBe('MMMM d');
    expect(dayMonthPattern('de-DE')).toBe('d. MMMM');
  });

  it('takes a short month too', () => {
    expect(dayMonthPattern('en-US', 'short')).toBe('MMM d');
    expect(dayMonthPattern('de-DE', 'short')).toBe('d. MMM');
  });

  it('falls back to the bare day and month for a tag Intl cannot read', () => {
    expect(dayMonthPattern('not a locale')).toBe('d MMMM');
    expect(fullDatePattern('not a locale')).toBe('EEEE, d MMMM');
  });
});
