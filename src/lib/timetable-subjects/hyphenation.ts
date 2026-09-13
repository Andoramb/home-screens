/**
 * Where a subject name is allowed to break when it does not fit on one line.
 *
 * A cell on a wall is narrow and a school subject is often a long word, so the
 * browser hyphenates. Left to itself it picks the break that fills the line
 * best, which lands in the middle of the second half of a compound
 * ("Sachunter-richt", "Förderun-terricht") and is markedly harder to read from
 * a few steps away than the seam the word is actually made at
 * ("Sach-unterricht"). Each language lists the seams of its own long subject
 * names beside its catalogue, and this turns that list into break marks the
 * browser honours.
 *
 * Three rules keep it safe:
 *
 * - **Render time only.** The marks are invisible characters; they belong in
 *   the drawn label and never in the layout model, the saved subject, an
 *   export or anything a test reads. Nothing here is called before a cell is
 *   about to be painted.
 * - **A name nobody listed is left alone.** Households type their own subject
 *   names, so a miss returns the name unchanged and the browser keeps
 *   hyphenating it the way it does today.
 * - **The marks never show unless they are used.** A soft hyphen prints only
 *   at the break the browser takes, and a name that fits reads exactly as it
 *   was typed.
 */

import { resolveLocaleChain } from '@/i18n/fallback';
import { DE_DE_NAME_SEAMS } from './de-DE';
import { NL_NL_NAME_SEAMS } from './nl-NL';
import { DA_DK_NAME_SEAMS } from './da-DK';

/** A break the browser may take, printing a hyphen there when it does. */
const SOFT_HYPHEN = '\u00AD';

/**
 * A break with no hyphen of its own, for a seam that falls right after a
 * hyphen the name already carries ("Wirtschaft-Politik"). A soft hyphen there
 * would print a second one.
 */
const ZERO_WIDTH_SPACE = '\u200B';

/**
 * The seam lists, by the locale whose catalogue they belong to. A language
 * with no list here keeps the browser's own hyphenation, which is what every
 * language got before any list existed.
 */
const SEAMS_BY_LOCALE: Record<string, string[][]> = {
  'de-DE': DE_DE_NAME_SEAMS,
  'nl-NL': NL_NL_NAME_SEAMS,
  'da-DK': DA_DK_NAME_SEAMS,
};

/** One language's seams, as name (folded for lookup) to break offsets. */
type SeamTable = Map<string, number[]>;

const TABLE_CACHE = new Map<string, SeamTable>();

/** The offsets a split name may break at: after each part but the last. */
function offsetsOf(parts: string[]): number[] {
  const offsets: number[] = [];
  let at = 0;
  for (const part of parts.slice(0, -1)) {
    at += part.length;
    offsets.push(at);
  }
  return offsets;
}

/**
 * A name reduced to what it is looked up by, so a household that typed its
 * own capitals still gets the seams of the word it typed.
 */
function fold(name: string): string {
  return name.trim().toLowerCase();
}

function tableFor(locale: string): SeamTable {
  const cached = TABLE_CACHE.get(locale);
  if (cached) return cached;

  const table: SeamTable = new Map();
  for (const tag of resolveLocaleChain(locale)) {
    const seams = SEAMS_BY_LOCALE[tag];
    if (!seams) continue;
    for (const parts of seams) table.set(fold(parts.join('')), offsetsOf(parts));
    break;
  }
  TABLE_CACHE.set(locale, table);
  return table;
}

/**
 * `name` with a break mark at each seam the language lists for it, or the name
 * untouched when the language lists none.
 *
 * The marks are invisible: the returned string reads exactly as the name does
 * unless the browser has to break it, and stripping the two mark characters
 * always gives the name back.
 */
export function hyphenateSubjectName(name: string, locale: string): string {
  const text = name.trim();
  const offsets = tableFor(locale).get(fold(text));
  if (!offsets?.length) return name;

  let out = '';
  let from = 0;
  for (const at of offsets) {
    out += text.slice(from, at);
    out += text[at - 1] === '-' ? ZERO_WIDTH_SPACE : SOFT_HYPHEN;
    from = at;
  }
  return out + text.slice(from);
}

/** @internal for tests: the marks a hyphenated name may carry. */
export const SUBJECT_BREAK_MARKS = { soft: SOFT_HYPHEN, zeroWidth: ZERO_WIDTH_SPACE } as const;
