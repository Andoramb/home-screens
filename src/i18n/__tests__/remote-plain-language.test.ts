import { describe, it, expect } from 'vitest';
import { flatten, loadDict } from './helpers/dict';

/**
 * The phone dictionary is read by parents standing in a kitchen and by kids,
 * never by the person who wrote the code. Two habits kept leaking into it and
 * are worth a ratchet, because both read as perfectly clear to whoever typed
 * them:
 *
 *  - "module", the word for a thing on a screen that only exists inside this
 *    codebase. The Photos tab shows the house style: "Photos show up here
 *    once a photo slideshow is on one of your screens", then the address to
 *    open on a computer.
 *  - the name of a Settings page dropped into a sentence ("finish setting it
 *    up under Per display"), which means nothing to somebody who has never
 *    opened that page and cannot be searched for from a phone.
 *
 * Only en-US is checked. The other locales are translations of these strings,
 * and a word like "Modul" is a judgement call for whoever translates it.
 */

const BANNED: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /\bmodules?\b/i,
    why: 'name what it is on the wall instead ("a to-do list", "a photo slideshow", "a chore chart")',
  },
  {
    pattern: /\bper display\b/i,
    why: 'a Settings page name means nothing on a phone; say where to go in plain words',
  },
];

describe('the /remote dictionary stays in plain words', () => {
  it('never says "module" or names a settings page', () => {
    const dict = loadDict('en-US', 'remote');
    expect(dict).not.toBeNull();

    const offenders: string[] = [];
    for (const [key, value] of Object.entries(flatten(dict!))) {
      const texts = typeof value === 'string'
        ? [value]
        : Object.values(value as Record<string, string>);
      for (const text of texts) {
        for (const { pattern, why } of BANNED) {
          if (pattern.test(text)) offenders.push(`${key}: "${text}" (${why})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
