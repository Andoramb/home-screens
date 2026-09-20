import { describe, it, expect } from 'vitest';
import { flatten, loadDict } from './helpers/dict';

/**
 * Two corners of the editor dictionary were written in the vocabulary of the
 * CSS property or the data shape behind the control rather than of the person
 * moving the slider.
 *
 * The Style panel labelled its sliders Border Radius, Opacity, Padding and
 * Font Weight, which name the stored field and not what moving them does to
 * the card. The schedule's "How it repeats" offered "Every day I pick" and
 * "One stretch", neither of which says what it does when read cold.
 *
 * Only en-US is checked, as in the phone ratchet next door: every other locale
 * is a translation of these strings and the right word there is a judgement
 * call for whoever translates it.
 */

const STYLE_JARGON: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /border\s*radius/i, why: 'say what it does to the corners' },
  { pattern: /\bopacity\b/i, why: 'say how solid the card looks' },
  { pattern: /\bpadding\b/i, why: 'say it is the space inside the card' },
  { pattern: /font\s*weight/i, why: 'say it is how thick the text is' },
];

describe('the Style panel labels say what they do', () => {
  it('names no CSS property', () => {
    const dict = loadDict('en-US', 'editor');
    expect(dict).not.toBeNull();

    const fields = flatten(dict!.propertyPanel as Record<string, unknown>, 'propertyPanel');
    const offenders: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (!key.startsWith('propertyPanel.fields.') || typeof value !== 'string') continue;
      for (const { pattern, why } of STYLE_JARGON) {
        if (pattern.test(value)) offenders.push(`${key}: "${value}" (${why})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the schedule shape options say what they do', () => {
  const dict = loadDict('en-US', 'editor') as Record<string, unknown>;
  const scheduleEditor = dict.scheduleEditor as Record<string, string>;

  it('describes each shape in enough words to choose between them', () => {
    // "One stretch" and "Every day I pick" are the two shapes' internal names,
    // not descriptions: both are four words or fewer and neither says what
    // happens to the hours.
    for (const key of ['shapeRepeat', 'shapeSpan']) {
      const value = scheduleEditor[key];
      expect(value, key).toBeTypeOf('string');
      expect(value.split(/\s+/).length, `${key}: "${value}"`).toBeGreaterThan(4);
    }
  });

  it('tells the reader which one runs past midnight', () => {
    const both = `${scheduleEditor.shapeRepeat} ${scheduleEditor.shapeSpan}`.toLowerCase();
    expect(both).toMatch(/\bday(s)?\b/);
    expect(scheduleEditor.shapeRepeat).not.toBe(scheduleEditor.shapeSpan);
  });
});
