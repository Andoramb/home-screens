/**
 * How big the Day view draws, and what it gives up to draw that big.
 *
 * Pure, like the Week card's `cardBaseFontSize`: the size is settled from the
 * box and the day's contents before anything is drawn, so every row on the
 * wall shares one answer and a screenshot never catches the rows disagreeing.
 * Widths are estimated, deliberately over-estimated, with the same bounds the
 * Week card uses (`estimateTextPx`), so being wrong costs a shed word and never
 * a clipped letter.
 *
 * Two shapes. In rows (Layout: Stacked) every person is a row on one clock
 * that runs left to right, with a header card over the rows carrying the hour
 * ruler and a packing card under them. In columns (Layout: Side by side) every
 * person is a column and the clock runs down, the packing list sits in each
 * column's head, and the hour ruler is a narrow card on the left.
 *
 * The binding constraint on a busy day is the shortest lesson: a block is as
 * wide as its minutes, so a single 45 minute period on a ten hour clock is
 * the tightest box in the module, and it has to hold at least its code.
 */

import type { TimeFormat, TimetableDetail } from '@/types/config';
import { CARD_GAP_PX, estimateTextPx, smallPrintPx, type TimetableShed } from '@/lib/timetable-layout';

export type DayOrientation = 'rows' | 'columns';

/** The words the component composes, measured in characters. */
export interface DayWords {
  /** "starts" beside the first bell in the row head. */
  starts: number;
  /** "Done" over the going-home time. */
  ends: number;
  /** "usually {time}" under a short day's end. */
  usually: number;
  /** "{care} until {time}", the longest care line any row prints. */
  careUntil: number;
  /** "until {time}", the short form of it. */
  careShort: number;
  /** The packing card's title ("Pack tonight"). */
  packTitle: number;
  /** The packing card's subtitle ("for Friday, 11 September"). */
  packSub: number;
  /** "nothing special", the strip's empty answer. */
  nothing: number;
  /** The widest clock time the card prints ("07:50" or "10:15 AM"). */
  time: number;
  /** The widest hour label on the ruler ("07:00" or "10 AM"). */
  tick: number;
}

export interface DayFitLesson {
  /** How long the block is on the clock. */
  minutes: number;
  codeChars: number;
  /** The subject name, and the widest line its seams can make, a break's hyphen included. */
  nameChars: number;
  namePartChars: number;
  /** The course badge beside the name, in characters. 0 for none. */
  courseChars: number;
  /** This person's subjects carry pictures, so the block has a picture line above the name. */
  icon?: boolean;
}

export interface DayFitInput {
  /** The module's box inside its own padding, in CSS pixels. */
  width: number;
  height: number;
  /** Height already spent on the heading above the cards. */
  bandPx?: number;
  /** One card's padding plus its border, on one side. */
  inset: number;
  orientation: DayOrientation;
  rowCount: number;
  /** The shared clock, in minutes past midnight. */
  axis: { startMin: number; endMin: number };
  detail: TimetableDetail;
  /**
   * Every lesson block on every open row, as the words it prints. Each is held
   * against its own minutes: a 45 minute "Deutsch" beside a 90 minute double
   * of "Sozialwissenschaften" is two different questions, and the badge on one
   * lesson costs nothing on the next.
   */
  lessons: readonly DayFitLesson[];
  /** The longest name, class and school in the row heads. */
  nameChars: number;
  classChars: number;
  schoolChars: number;
  words: DayWords;
  timeFormat?: TimeFormat;
  /** A short day puts a banner in the header card, which is taller for it. */
  hasShortDay: boolean;
  hasCare: boolean;
  hasWeekLetter: boolean;
  /** What the rows have given up to draw at the size asked for. Omitted = nothing. */
  shed?: TimetableShed;
}

// ---------------------------------------------------------------------------
// Proportions, in em of the module's one type size unless they say px
// ---------------------------------------------------------------------------

/** The header card with the ruler, and the packing card. */
const HEAD_EM = { plain: 3.1, short: 3.6 } as const;
const STRIP_EM = 3.1;
/** In columns: the header card over the columns, and each column's own head and foot. */
const COLS = { headEm: 2.6, rulerEm: 3.1, cheadEm: 5.6, cendEm: 3.7, laneGapEm: 0.4, laneTailEm: 0.5 } as const;
/** The who column and the end column never get narrower than this. */
const WHO_MIN_EM = 8.6;
const END_MIN_EM = 4.9;
/** Nor wider than this share of the row, so the clock keeps most of it. */
const WHO_MAX_SHARE = 0.32;
const END_MAX_SHARE = 0.22;
/** The gap either side of the clock. */
const COLUMN_GAP_EM = 0.7;
/** A block is inset from its minutes by this on each side, so neighbours do not touch. */
const BLOCK_INSET = { minPx: 2, em: 0.08 } as const;
/** Padding inside a block, per side. */
const BLOCK_PAD_EM = { rows: { x: 0.34, y: 0.18 }, columns: { x: 0.34, y: 0.12 } } as const;

/** Sizes inside a block, in em of the module. */
const BLOCK_TEXT = {
  code: { em: 1, line: 1.06 },
  name: { em: 0.8, line: 1.05 },
  /** The room and the start time under a name, with a pixel floor. */
  sub: { em: 0.54, px: 15, gapEm: 0.16 },
  badge: { em: 0.46, px: 14 },
} as const;
/** A name is held to three lines: "Sach-unter-richt" is three, and the block's height is checked for them. */
const NAME_MAX_LINES = 3;
/** How wide a name is in em of its size: the Week card's bound, most of a letter of slack included. */
const NAME_WIDTH = { perChar: 0.5, plus: 0.8 } as const;
/** How wide a bold subject code is, in em of its size: the Week card's bound. */
const CODE_WIDTH = { perChar: 0.6, plus: 0.15 } as const;
/** The leading every stack of small lines is drawn with, so the fit and the card count the same height. */
export const DAY_LINE = 1.2;

/** The row head's lines. */
const WHO_TEXT = {
  avatarEm: 1.7 * 0.8,
  gapEm: 0.4,
  name: { em: 1, perChar: 0.62 },
  grade: { em: 0.56, px: 15 },
  starts: { em: 0.56, px: 15 },
  time: { em: 1.12, perChar: 0.6 },
} as const;
/** The end column's lines. */
const END_TEXT = {
  padEm: 0.7,
  time: { em: 1.12, perChar: 0.6 },
  care: { em: 0.56, px: 15 },
  usual: { em: 0.52, px: 15 },
} as const;
/** The packing card's own type. */
const STRIP_TEXT = {
  title: { em: 0.62, px: 16 },
  sub: { em: 0.54, px: 15 },
  name: { em: 0.62, px: 16 },
  pill: { em: 0.56, px: 15 },
  iconEm: 1,
} as const;
/** The hour labels on the ruler. */
const TICK_TEXT = { em: 0.56, px: 15 } as const;
/** An hour narrower than its label by this much labels every other hour instead. */
const TICK_ROOM = 1.3;

/**
 * Taste: how many em of the module's size one row card (or column card) wants
 * to be before its contents are counted. Read off the signed-off frames: five
 * rows at Less were drawn at about 4.9em a row, three at Some at about 7, one
 * at More at about 7.9, and the type came out a little under each.
 */
const ROW_EM: Record<TimetableDetail, number> = { less: 4.6, some: 6.2, more: 7.4 };
const COL_EM: Record<TimetableDetail, number> = { less: 5.5, some: 7.0, more: 8.0 };
/**
 * Whatever the rows want, the type never grows past this share of the box's
 * width plus height. Width and height together rather than the long side
 * alone: a share of the long side starved a 1000px module down to 19px while
 * still allowing 36px on a television, and a module's size is its area, not
 * its longer edge.
 */
const PERIMETER_CAP_EM = 75;

const MIN_BASE_PX = 6;
const FIT_STEPS = 16;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clampShed = (input: DayFitInput): TimetableShed => input.shed ?? 0;

/** A pixel floor, capped at the module's own size, exactly as the component draws it. */
function small(base: number, size: { em: number; px: number }): number {
  return smallPrintPx(base, size);
}

/**
 * Whether a name can be drawn in this width without clipping: the whole word
 * on one line, or the widest line its seams make (`partChars`, the break's
 * hyphen included). Bold mixed case runs about 0.55em a letter in the wall's
 * face.
 */
export function nameFitsLine(nameChars: number, partChars: number, fontPx: number, availablePx: number): boolean {
  const widest = Math.min(nameChars, partChars);
  return widest * NAME_BOLD_PER_CHAR * fontPx <= availablePx;
}
const NAME_BOLD_PER_CHAR = 0.55;

/** The care line's form the column foot can hold: the full line, or "until {time}" alone. */
export function careLineForm(fullChars: number, fontPx: number, availablePx: number): 'full' | 'short' {
  return furniturePx(fullChars, fontPx) <= availablePx ? 'full' : 'short';
}

/** Whether a run of lower-case words, drawn at this size, fits the width; a chip's icon and padding included. */
export function wordsFit(chars: number, fontPx: number, availablePx: number): boolean {
  return wordsPx(chars, fontPx) + fontPx * 1.6 <= availablePx;
}

/**
 * How wide a line of furniture is, in pixels. A fifth over the Week card's
 * bound on purpose: these lines carry capitals, digits and the odd "PM", which
 * run wider than the mixed-case names the bound was taken from, and each of
 * them is drawn with an ellipsis that would otherwise take a digit.
 */
function furniturePx(chars: number, fontPx: number): number {
  return (chars * FURNITURE_PER_CHAR + 0.1) * fontPx * FURNITURE_SLACK;
}
/**
 * Measured off the rendered end column: "OGS bis 15:00" at 15px comes to
 * 0.65em a character, capitals and tabular digits both being wider than the
 * lower-case letters a subject name is made of.
 */
const FURNITURE_PER_CHAR = 0.62;
const FURNITURE_SLACK = 1.08;

/** How wide a run of lower-case words is ("nothing special", "Pack tonight"): the name bound, a tenth over. */
function wordsPx(chars: number, fontPx: number): number {
  return estimateTextPx(chars, fontPx) * 1.1;
}

function spanMin(input: DayFitInput): number {
  return Math.max(1, input.axis.endMin - input.axis.startMin);
}

function blockInsetPx(base: number): number {
  return Math.max(BLOCK_INSET.minPx, BLOCK_INSET.em * base);
}

/** What the rows print in a lesson at this Detail, less what they have shed. */
function lessonForm(input: DayFitInput): { names: boolean; sub: number } {
  const shed = clampShed(input);
  const names = input.detail !== 'less' && shed < 2;
  const sub = !names || shed >= 1 ? 0 : input.detail === 'more' ? 2 : 1;
  return { names, sub };
}

/** The course badge's width: not drawn at Less, and never once names are gone. */
function badgePx(input: DayFitInput, base: number, courseChars: number): number {
  if (courseChars <= 0 || !lessonForm(input).names) return 0;
  const size = small(base, BLOCK_TEXT.badge);
  // Its own padding, and the gap before it.
  return estimateTextPx(courseChars, size) + size * 0.64 + 0.25 * base;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface RowsGeometry {
  orientation: 'rows';
  /** The header card, each row card, and the packing card, in CSS pixels. */
  headPx: number;
  rowPx: number;
  stripPx: number;
  /** Inside a row card: the who column, the end column, and the gap beside the clock. */
  whoPx: number;
  endPx: number;
  gapPx: number;
  /** The clock's own width. */
  lanePx: number;
  /** Every other hour is labelled when an hour is too narrow for its label. */
  tickEvery: 60 | 120;
}

export interface ColumnsGeometry {
  orientation: 'columns';
  headPx: number;
  rulerPx: number;
  colPx: number;
  /** Inside a column card: the head with the bag, the clock, and the foot with the end time. */
  cheadPx: number;
  cendPx: number;
  laneGapPx: number;
  laneTailPx: number;
  lanePx: number;
  tickEvery: 60 | 120;
}

export type DayGeometry = RowsGeometry | ColumnsGeometry;

function innerWidth(input: DayFitInput): number {
  return Math.max(0, input.width - input.inset * 2);
}

function gridHeight(input: DayFitInput): number {
  return Math.max(0, input.height - (input.bandPx ?? 0));
}

/** The row head's widest line, in pixels. */
function whoNeedPx(input: DayFitInput, base: number): number {
  const gradePx = small(base, WHO_TEXT.grade);
  const nameRow =
    WHO_TEXT.avatarEm * base
    + WHO_TEXT.gapEm * base
    + (input.nameChars * WHO_TEXT.name.perChar + 0.1) * base
    + (input.classChars > 0 ? WHO_TEXT.gapEm * base + furniturePx(input.classChars, gradePx) : 0);
  const startsRow =
    wordsPx(input.words.starts, small(base, WHO_TEXT.starts))
    + 0.3 * base
    + input.words.time * WHO_TEXT.time.perChar * WHO_TEXT.time.em * base;
  const stripTitle = STRIP_TEXT.iconEm * small(base, STRIP_TEXT.title) + 0.35 * base
    + wordsPx(input.words.packTitle, small(base, STRIP_TEXT.title));
  // The strip's subtitle (the date) is not counted: it is the least important
  // line in the column and gives up its end rather than widening the column
  // for every row above it.
  return Math.max(nameRow, startsRow, stripTitle);
}

/** The end column's widest line, in pixels, its own padding included. */
function endNeedPx(input: DayFitInput, base: number): number {
  const time = input.words.time * END_TEXT.time.perChar * END_TEXT.time.em * base;
  const care = input.hasCare ? furniturePx(input.words.careUntil, small(base, END_TEXT.care)) : 0;
  const usual = input.hasShortDay
    ? furniturePx(input.words.usually + 1 + input.words.time, small(base, END_TEXT.usual))
    : 0;
  return Math.max(time, care, usual) + END_TEXT.padEm * base;
}

function tickLabelPx(input: DayFitInput, base: number): number {
  return furniturePx(input.words.tick, small(base, TICK_TEXT));
}

/**
 * The header and packing cards are sized in em, but the small print inside
 * them has pixel floors that stop shrinking with the type. Below about 28px
 * the floors are the taller of the two, so each card is at least what its
 * lines need inside the card's own padding: at 18px the strip used to be
 * 56px tall with 43px of name and pill to fit in 22px of it.
 */
function headFloorPx(input: DayFitInput, base: number): number {
  const title = 0.92 * base * 1.3;
  const ticks = small(base, TICK_TEXT) * 1.3 + 0.32 * base;
  return input.inset * 2 + title + ticks;
}

function stripFloorPx(input: DayFitInput, base: number): number {
  const name = small(base, STRIP_TEXT.name) * 1.2;
  const pill = small(base, STRIP_TEXT.pill) * 1.6;
  return input.inset * 2 + name + 0.2 * base + pill + 0.8 * base;
}

export function rowsGeometry(input: DayFitInput, base: number): RowsGeometry {
  const n = Math.max(1, input.rowCount);
  const headPx = Math.max((input.hasShortDay ? HEAD_EM.short : HEAD_EM.plain) * base, headFloorPx(input, base));
  const stripPx = Math.max(STRIP_EM * base, stripFloorPx(input, base));
  const rowPx = Math.max(0, (gridHeight(input) - headPx - stripPx - CARD_GAP_PX * (n + 1)) / n);
  const inner = innerWidth(input);
  const whoPx = Math.min(WHO_MAX_SHARE * inner, Math.max(WHO_MIN_EM * base, whoNeedPx(input, base)));
  const endPx = Math.min(END_MAX_SHARE * inner, Math.max(END_MIN_EM * base, endNeedPx(input, base)));
  const gapPx = COLUMN_GAP_EM * base;
  const lanePx = Math.max(0, inner - whoPx - endPx - gapPx * 2);
  const hourPx = (lanePx / spanMin(input)) * 60;
  return {
    orientation: 'rows',
    headPx,
    rowPx,
    stripPx,
    whoPx,
    endPx,
    gapPx,
    lanePx,
    tickEvery: hourPx >= tickLabelPx(input, base) * TICK_ROOM ? 60 : 120,
  };
}

export function columnsGeometry(input: DayFitInput, base: number): ColumnsGeometry {
  const n = Math.max(1, input.rowCount);
  const headPx = Math.max(COLS.headEm * base, input.inset * 2 + 0.92 * base * 1.3);
  // The ruler is its own card, so its padding sits either side of the hour
  // labels, and the labels have a pixel floor: below about 21px of type the
  // em width no longer holds "07:00" inside the padding, so the card widens
  // to what the label needs rather than clipping it.
  const rulerPx = Math.max(COLS.rulerEm * base, input.inset * 2 + tickLabelPx(input, base) + 0.2 * base);
  const colPx = Math.max(0, (input.width - rulerPx - CARD_GAP_PX * n) / n);
  const bodyPx = Math.max(0, gridHeight(input) - headPx - CARD_GAP_PX);
  const innerH = Math.max(0, bodyPx - input.inset * 2);
  // The same floors as the rows' cards: the head holds a name line, a start
  // line and a row of pills, the foot two small lines around the time.
  const cheadPx = Math.max(
    COLS.cheadEm * base,
    base * 1.2 + WHO_TEXT.time.em * base * 1.2 + small(base, STRIP_TEXT.pill) * 1.6 + 0.7 * base,
  );
  const cendPx = Math.max(
    COLS.cendEm * base,
    small(base, END_TEXT.care) * DAY_LINE * 2 + 1.05 * base * DAY_LINE + 0.7 * base,
  );
  const laneGapPx = COLS.laneGapEm * base;
  const laneTailPx = COLS.laneTailEm * base;
  const lanePx = Math.max(0, innerH - cheadPx - cendPx - laneGapPx - laneTailPx);
  const hourPx = (lanePx / spanMin(input)) * 60;
  const tickPx = small(base, TICK_TEXT) * 1.2;
  return {
    orientation: 'columns',
    headPx,
    rulerPx,
    colPx,
    cheadPx,
    cendPx,
    laneGapPx,
    laneTailPx,
    lanePx,
    tickEvery: hourPx >= tickPx * TICK_ROOM ? 60 : 120,
  };
}

export function dayGeometry(input: DayFitInput, base: number): DayGeometry {
  return input.orientation === 'rows' ? rowsGeometry(input, base) : columnsGeometry(input, base);
}

// ---------------------------------------------------------------------------
// Does it hold?
// ---------------------------------------------------------------------------

/** The box a lesson of `minutes` gets, inside its padding, in pixels. */
function blockPx(input: DayFitInput, base: number, geometry: DayGeometry, minutes: number): { w: number; h: number } {
  const pad = BLOCK_PAD_EM[input.orientation];
  const along = (geometry.lanePx / spanMin(input)) * minutes - blockInsetPx(base) * 2;
  if (geometry.orientation === 'rows') {
    return {
      w: along - pad.x * 2 * base,
      h: geometry.rowPx - input.inset * 2 - pad.y * 2 * base,
    };
  }
  return {
    w: geometry.colPx - input.inset * 2 - pad.x * 2 * base,
    h: along - pad.y * 2 * base,
  };
}

/**
 * Whether one lesson's block holds what the rows print at this size.
 *
 * The code is never shed: a block too narrow for its code fails the size.
 * A name may take two lines, breaking at its seams; the longest run that
 * cannot break has to fit the width on its own.
 */
function lessonHolds(input: DayFitInput, base: number, geometry: DayGeometry, lesson: DayFitLesson): boolean {
  if (lesson.minutes <= 0) return true;
  const box = blockPx(input, base, geometry, lesson.minutes);
  if (box.w <= 0 || box.h <= 0) return false;
  const form = lessonForm(input);
  const badge = badgePx(input, base, lesson.courseChars);
  // The picture line above the name, where the person has pictures on. It
  // is the first thing a tight block gives up, with the rooms.
  let height = lesson.icon && clampShed(input) === 0 ? 0.72 * base + 0.12 * base : 0;
  if (form.names) {
    // The name breaks at its seams where they fit and anywhere the browser's
    // dictionary allows where they do not, so what is held here is the lines
    // it takes, not the width of any one part. A block too narrow for a
    // single word of it is still a fail: nothing can be broken below a word.
    const namePx = BLOCK_TEXT.name.em * base;
    if (!nameFitsLine(lesson.nameChars, lesson.namePartChars, namePx, box.w)) return false;
    const lines = Math.min(
      NAME_MAX_LINES,
      Math.max(1, Math.ceil(((lesson.nameChars * NAME_WIDTH.perChar + NAME_WIDTH.plus) * namePx + badge) / box.w)),
    );
    height += lines * namePx * BLOCK_TEXT.name.line;
  } else {
    // A code is bold and short, and the Week card's bound for one is wider
    // per letter than a name's: "Deu" at 11px measures 22px, not 15.
    if ((lesson.codeChars * CODE_WIDTH.perChar + CODE_WIDTH.plus) * base > box.w) return false;
    height += base * BLOCK_TEXT.code.line;
  }
  if (form.sub > 0) {
    const subPx = small(base, BLOCK_TEXT.sub);
    height += form.sub * (subPx * 1.1 + BLOCK_TEXT.sub.gapEm * base);
    // The room and the time each give up their end rather than the block its
    // size, so only the height is held to.
  }
  return height <= box.h;
}

/** The row head, the end column and the packing strip, in rows. */
function rowsFurnitureHolds(input: DayFitInput, base: number, geometry: RowsGeometry): boolean {
  const inner = innerWidth(input);
  if (geometry.lanePx <= 0) return false;
  if (whoNeedPx(input, base) > geometry.whoPx + 0.5) return false;
  if (endNeedPx(input, base) > geometry.endPx + 0.5) return false;
  // The row head stacks a name line and a start line, at More a school line too.
  const headLines = WHO_TEXT.name.em * base * 1.2 + WHO_TEXT.time.em * base * 1.2 + 0.28 * base
    + (input.detail === 'more' && input.schoolChars > 0 ? small(base, WHO_TEXT.grade) * 1.2 + 0.2 * base : 0);
  if (headLines > geometry.rowPx - input.inset * 2) return false;
  // Each person's share of the strip holds their avatar and name, and the
  // empty answer beside a name is the widest line the strip cannot ellipsise.
  const n = Math.max(1, input.rowCount);
  const segment = (inner - geometry.whoPx - geometry.gapPx) / n - 0.4 * base;
  const namePx = small(base, STRIP_TEXT.name);
  const pillPx = small(base, STRIP_TEXT.pill);
  const stripLine = WHO_TEXT.avatarEm * base + 0.45 * base + 0.8 * base
    + Math.max(wordsPx(input.nameChars, namePx), wordsPx(input.words.nothing, pillPx) + pillPx * 1.4);
  if (stripLine > segment) return false;
  return true;
}

/** The column head, the ruler and the foot, in columns. */
function columnsFurnitureHolds(input: DayFitInput, base: number, geometry: ColumnsGeometry): boolean {
  if (geometry.lanePx <= 0) return false;
  const iw = geometry.colPx - input.inset * 2;
  if (iw <= 0) return false;
  const gradePx = small(base, WHO_TEXT.grade);
  const nameRow = WHO_TEXT.avatarEm * base + WHO_TEXT.gapEm * base
    + (input.nameChars * WHO_TEXT.name.perChar + 0.1) * base
    + (input.classChars > 0 ? 0.3 * base + furniturePx(input.classChars, gradePx) : 0);
  if (nameRow > iw) return false;
  const startsRow = wordsPx(input.words.starts, small(base, WHO_TEXT.starts)) + 0.3 * base
    + input.words.time * WHO_TEXT.time.perChar * WHO_TEXT.time.em * base;
  if (startsRow > iw) return false;
  const endTime = input.words.time * END_TEXT.time.perChar * 1.05 * base;
  if (endTime > iw) return false;
  // The care line in the foot has a shorter form ("until 15:00") for a column
  // too narrow for the full one; only the short form is held against the width.
  if (input.hasCare && furniturePx(input.words.careShort, small(base, END_TEXT.care)) > iw) return false;
  if (tickLabelPx(input, base) > geometry.rulerPx - input.inset * 2) return false;
  return true;
}

/** Whether the whole view holds together at this size, with what it has shed. */
export function dayHoldsAt(input: DayFitInput, base: number): boolean {
  if (base <= 0) return false;
  const geometry = dayGeometry(input, base);
  if (geometry.orientation === 'rows') {
    if (!rowsFurnitureHolds(input, base, geometry)) return false;
  } else if (!columnsFurnitureHolds(input, base, geometry)) return false;
  return input.lessons.every((lesson) => lessonHolds(input, base, geometry, lesson));
}

// ---------------------------------------------------------------------------
// The size
// ---------------------------------------------------------------------------

/**
 * The size the shape of the box asks for, before the day in it is counted.
 *
 * In rows every row wants `ROW_EM` of the size, the header and strip want
 * theirs, and the gaps are pixels; solved for the size, that is one line. In
 * columns the column's width is what the type is measured against. Either way
 * the width caps it, so one child on a television does not get a poster.
 */
export function dayTasteFontSize(input: DayFitInput): number {
  const n = Math.max(1, input.rowCount);
  const inner = innerWidth(input);
  if (inner <= 0 || gridHeight(input) <= 0) return 0;
  let wanted: number;
  if (input.orientation === 'rows') {
    const headEm = input.hasShortDay ? HEAD_EM.short : HEAD_EM.plain;
    const spare = gridHeight(input) - CARD_GAP_PX * (n + 1);
    wanted = spare / (headEm + STRIP_EM + n * ROW_EM[input.detail]);
  } else {
    const spare = input.width - CARD_GAP_PX * n - input.inset * 2 * n;
    wanted = spare / (COLS.rulerEm + n * COL_EM[input.detail]);
  }
  const cap = (input.width + input.height) / PERIMETER_CAP_EM;
  return Math.max(0, Math.min(wanted, cap));
}

/** The largest size at or below `wanted` that holds, or 0 for none. */
function largestHolding(input: DayFitInput, wanted: number, floor = MIN_BASE_PX): number {
  if (dayHoldsAt(input, wanted)) return wanted;
  if (!dayHoldsAt(input, floor)) return 0;
  let lo = floor;
  let hi = wanted;
  for (let step = 0; step < FIT_STEPS; step++) {
    const mid = (lo + hi) / 2;
    if (dayHoldsAt(input, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The size the Day view draws itself at: taste, held against the day's own
 * contents with nothing shed. The sibling rule is built in, because the whole
 * view is measured as one thing: the shortest lesson on any row is the one
 * that has to hold its words.
 */
export function dayBaseFontSize(input: DayFitInput): number {
  if (input.width <= 0 || gridHeight(input) <= 0) return 0;
  const wanted = dayTasteFontSize(input);
  // No floor state: a box too small for its rows is drawn at the smallest
  // size, honestly cramped, rather than replaced by a message.
  if (wanted <= MIN_BASE_PX) return MIN_BASE_PX;
  // The size that holds every word, and the size that holds the codes alone.
  // Names are worth some size but not most of it: on a television the two
  // are a few pixels apart and the names win, as the frames drew them; in a
  // 1000px box a 45 minute period is 50px wide, the names would cost half
  // the type, and the codes win at the size the box deserves. Whatever is
  // chosen, `resolveDayFontSize` keeps as much detail as holds at it.
  const withNames = largestHolding({ ...input, shed: 1 }, wanted);
  const withCodes = largestHolding({ ...input, shed: 2 }, wanted);
  const chosen = withNames >= withCodes * NAMES_WORTH ? withNames : withCodes;
  return Math.max(MIN_BASE_PX, chosen);
}

/** How much of the type the full names may cost before the codes take over. */
const NAMES_WORTH = 0.75;

/**
 * What the view can draw when Text size asks for a size: the same ladder the
 * Week card climbs down. First the rooms and times under the names go, then
 * the names give way to codes, and only when even the codes will not go in
 * does the size itself come down, never below the size the view would have
 * chosen for itself.
 */
export function resolveDayFontSize(
  input: DayFitInput,
  wanted: number,
): { fontSize: number; shed: TimetableShed } {
  if (wanted <= 0 || input.width <= 0 || gridHeight(input) <= 0) {
    return { fontSize: Math.max(0, wanted), shed: 0 };
  }
  for (const shed of [0, 1, 2] as const) {
    if (dayHoldsAt({ ...input, shed }, wanted)) return { fontSize: wanted, shed };
  }
  const own = Math.max(MIN_BASE_PX, dayBaseFontSize(input));
  const fontSize = Math.max(own, largestHolding({ ...input, shed: 2 }, wanted, own));
  for (const shed of [0, 1] as const) {
    if (dayHoldsAt({ ...input, shed }, fontSize)) return { fontSize, shed };
  }
  return { fontSize, shed: 2 };
}
