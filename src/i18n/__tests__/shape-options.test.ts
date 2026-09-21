import { describe, it, expect } from 'vitest';
import { LOCALES } from '@/i18n/manifest';
import { loadDict } from './helpers/dict';

/**
 * The schedule shape options are the only place in the editor where the
 * whole meaning of a control lives in the text of a `<select>` option, and
 * the panel is too narrow to show much of it.
 *
 * Measured in a running editor: the select is 229px wide and, after its
 * padding and the native dropdown arrow, leaves **195px** for text at 12px
 * Inter. It clips mid-word with no ellipsis, so an option that overflows
 * does not read as truncated, it reads as a different sentence. German
 * rendered as "Ein durchgehender Zeitraum, der", which cuts off exactly
 * where it was about to say "over several days", the one fact that
 * distinguishes the two options.
 *
 * Every locale was over the line at some point, English included, so this
 * is checked for all of them rather than en-US only. The budget is in
 * characters because a unit test has no font metrics: 195px came to about
 * 32 characters of Latin text, and 34 is that with a little slack. Any
 * string this rejects was going to be cut off on screen.
 */
const MAX_OPTION_CHARS = 34;

describe('the schedule shape options fit the control that shows them', () => {
  for (const locale of Object.keys(LOCALES)) {
    it(`${locale} keeps both options inside the select`, () => {
      const dict = loadDict(locale, 'editor') as Record<string, unknown> | null;
      expect(dict, `${locale}/editor.json`).not.toBeNull();
      const scheduleEditor = dict!.scheduleEditor as Record<string, string>;

      for (const key of ['shapeRepeat', 'shapeSpan']) {
        const value = scheduleEditor[key];
        expect(value, `${locale} ${key}`).toBeTypeOf('string');
        expect(
          value.length,
          `${locale} ${key}: "${value}" is ${value.length} chars, over the ${MAX_OPTION_CHARS} the select can show`,
        ).toBeLessThanOrEqual(MAX_OPTION_CHARS);
      }
    });
  }
});
