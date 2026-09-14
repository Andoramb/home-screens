/**
 * Locks where a long subject name is allowed to break, and what happens to a
 * name nobody listed.
 *
 * The marks are invisible characters, so every assertion here spells them out:
 * a break the browser prints a hyphen at (U+00AD) and a break that prints
 * nothing because the name already ends that part with a hyphen (U+200B).
 * Stripping both always has to give the typed name back, which is what keeps
 * the marks out of anything a person or a store reads.
 */

import { describe, it, expect } from 'vitest';
import { hyphenateSubjectName } from '../timetable-subjects';
import { SUBJECT_BREAK_MARKS } from '../timetable-subjects/hyphenation';
import { DE_DE_SUBJECTS, DE_DE_NAME_SEAMS } from '../timetable-subjects/de-DE';
import { NL_NL_SUBJECTS, NL_NL_NAME_SEAMS } from '../timetable-subjects/nl-NL';
import { DA_DK_SUBJECTS, DA_DK_NAME_SEAMS } from '../timetable-subjects/da-DK';

const SHY = SUBJECT_BREAK_MARKS.soft;
const ZWSP = SUBJECT_BREAK_MARKS.zeroWidth;

/** The name as a reader sees it: every break mark taken back out. */
const plain = (text: string) => text.split(SHY).join('').split(ZWSP).join('');

const SEAM_LISTS = [
  { tag: 'de-DE', seams: DE_DE_NAME_SEAMS, subjects: DE_DE_SUBJECTS },
  { tag: 'nl-NL', seams: NL_NL_NAME_SEAMS, subjects: NL_NL_SUBJECTS },
  { tag: 'da-DK', seams: DA_DK_NAME_SEAMS, subjects: DA_DK_SUBJECTS },
];

describe('hyphenateSubjectName', () => {
  it('breaks a German compound at its seams, never at a fill-the-line spot', () => {
    // The compound seam first; "unterricht" is ten letters on its own, wider
    // than a single period on the Day view's clock, so it also carries its
    // own syllable seam rather than being broken wherever the line fills.
    expect(hyphenateSubjectName('Sachunterricht', 'de-DE')).toBe(`Sach${SHY}unter${SHY}richt`);
    expect(hyphenateSubjectName('Förderunterricht', 'de-DE')).toBe(`Förder${SHY}unter${SHY}richt`);
  });

  it('breaks a name at the hyphen it already has, without printing a second one', () => {
    // The break inside the first half is there for a cell too narrow to hold
    // it whole. A line takes the last break that fits, so the hyphen the name
    // already carries still wins wherever there is room for it.
    expect(hyphenateSubjectName('Wirtschaft-Politik', 'de-DE')).toBe(
      `Wirt${SHY}schaft-${ZWSP}Politik`,
    );
  });

  it('marks every seam of a name made of three parts', () => {
    expect(hyphenateSubjectName('Sozialwissenschaften', 'de-DE')).toBe(
      `Sozial${SHY}wissen${SHY}schaften`,
    );
  });

  it('leaves a name nobody listed exactly as it was typed', () => {
    // What a household types at the kitchen table: the browser's own
    // hyphenation still has it, and nothing invisible is added.
    expect(hyphenateSubjectName('Werkunterricht', 'de-DE')).toBe('Werkunterricht');
    expect(hyphenateSubjectName('Mathe', 'de-DE')).toBe('Mathe');
    expect(hyphenateSubjectName('', 'de-DE')).toBe('');
  });

  it('follows the name a household typed, capitals and all', () => {
    expect(hyphenateSubjectName('SACHUNTERRICHT', 'de-DE')).toBe(`SACH${SHY}UNTER${SHY}RICHT`);
  });

  it('is not a German-only table', () => {
    expect(hyphenateSubjectName('Aardrijkskunde', 'nl-NL')).toBe(`Aardrijks${SHY}kunde`);
    expect(hyphenateSubjectName('Samfundsfag', 'da-DK')).toBe(`Samfunds${SHY}fag`);
  });

  it('keeps each language to its own seams', () => {
    // An English wall showing a German word gets the browser's hyphenation,
    // not another language's break table.
    expect(hyphenateSubjectName('Sachunterricht', 'en-US')).toBe('Sachunterricht');
    expect(hyphenateSubjectName('Aardrijkskunde', 'de-DE')).toBe('Aardrijkskunde');
  });

  it('gives a region its language\'s seams', () => {
    expect(hyphenateSubjectName('Sachunterricht', 'de-AT')).toBe(`Sach${SHY}unter${SHY}richt`);
  });

  it('never changes what the name says', () => {
    for (const { tag, seams } of SEAM_LISTS) {
      for (const parts of seams) {
        const name = parts.join('');
        expect(plain(hyphenateSubjectName(name, tag))).toBe(name);
      }
    }
  });
});

describe('the seam lists', () => {
  for (const { tag, seams, subjects } of SEAM_LISTS) {
    describe(tag, () => {
      it('names one subject each, with no repeats', () => {
        const names = seams.map((parts) => parts.join(''));
        expect(new Set(names).size).toBe(names.length);
      });

      it('splits a name it actually has to split', () => {
        for (const parts of seams) {
          expect(parts.length).toBeGreaterThan(1);
          for (const part of parts) expect(part.length).toBeGreaterThan(0);
        }
      });

      it('stays with the catalogue it belongs to', () => {
        // A renamed subject would otherwise leave a seam behind that nothing
        // can ever match.
        const catalogue = new Set(subjects.map((subject) => subject.name));
        for (const parts of seams) expect(catalogue).toContain(parts.join(''));
      });
    });
  }
});
