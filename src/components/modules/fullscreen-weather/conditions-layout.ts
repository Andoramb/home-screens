import { CANVAS_PAD_X_U, CANVAS_PAD_Y_U } from './weather-view-utils';

/**
 * How the Conditions view lays out its instrument grid.
 *
 * Every card that is on and that the weather source can fill is drawn: the
 * toggles in the editor are the whole story of what shows, so the view
 * never withholds a card for room. Two columns in portrait, four in
 * landscape, and as many rows as the cards need.
 *
 * Height: each row is at least `rowMin`, which is what the fit loop sees
 * when too many rows of large type do not fit (it shrinks the type), and at
 * most `cardCap`, the phone's near-square card, so a page with few cards
 * does not stretch them into towers. Between the two the rows share the
 * slack, since a wall has nothing to scroll into empty space.
 *
 * Arithmetic over the scale, never a measurement: the fit loop measures the
 * stack after render.
 */

/** Card height over width at most. The phone's small cards are about square; the wider tablet cards a little flatter. */
export const PORTRAIT_CARD_RATIO = 0.86;
export const LANDSCAPE_CARD_RATIO = 0.78;
/** The least a card may be, in type units: padding, a label and a line (about 12.5) plus an instrument worth reading. */
export const CARD_MIN_S = 20;

export interface ConditionsGridInput {
  /** The module's box, in px. */
  width: number;
  height: number;
  /** Everything above the grid inside the stack, in px, with the stack gaps that precede the grid. */
  aboveHeight: number;
  /** The type and structure units. */
  s: number;
  u: number;
  land: boolean;
  /** Landscape puts the air quality card into the grid, across two cells of the first row. */
  airQualityInGrid: boolean;
  /** Instrument cards this wall can fill. */
  cardCount: number;
}

export interface ConditionsGrid {
  columns: number;
  rows: number;
  gap: number;
  /** A cell's width in px, from the columns. */
  cardWidth: number;
  /** The least and the most a row may be, in px. */
  rowMin: number;
  cardCap: number;
  /** The height a row should come out at: the slack shared, clamped between the two. Cards size their instruments from it. */
  rowHeight: number;
}

export function conditionsGrid(i: ConditionsGridInput): ConditionsGrid {
  const columns = i.land ? 4 : 2;
  const gap = i.u * 2;
  const contentWidth = i.width - 2 * i.u * CANVAS_PAD_X_U;
  const cardWidth = Math.max(0, (contentWidth - gap * (columns - 1)) / columns);
  const cardCap = cardWidth * (i.land ? LANDSCAPE_CARD_RATIO : PORTRAIT_CARD_RATIO);
  const rowMin = Math.min(cardCap, i.s * CARD_MIN_S);
  const cells = i.cardCount + (i.airQualityInGrid ? 2 : 0);
  const rows = Math.ceil(cells / columns);
  const contentHeight = i.height - 2 * i.u * CANVAS_PAD_Y_U;
  const room = contentHeight - i.aboveHeight - gap * Math.max(0, rows - 1);
  const rowHeight = rows > 0 ? Math.min(cardCap, Math.max(rowMin, room / rows)) : 0;
  return { columns, rows, gap, cardWidth, rowMin, cardCap, rowHeight };
}

/**
 * The height of the compact hero, from the type and structure units it is
 * built with (its place line at 5.2 s on a 1.1 line, a .4 u gap, and the
 * temperature line at 3.5 s on the browser's default line of about 1.2),
 * with a little over so an estimate on the low side never costs a fit pass.
 * Landscape adds the half unit of top padding the hero gives itself.
 */
export function compactHeroHeight(s: number, u: number, land: boolean): number {
  return s * 10.4 + u * .5 + (land ? u * .5 : 0);
}

/**
 * The alert band: its two lines of text, the gap between them, its padding
 * and its border, from `AlertBand`'s sizes.
 */
export function alertBandHeight(s: number, u: number): number {
  return s * 4.3 + u * 3.8 + 2;
}

/**
 * The portrait air quality card: whichever is taller of its `s * 17` floor and
 * its stacked content (padding, label, level, scale bar, sentence, and the
 * margins between them, as `AirQualityCard` sets them).
 */
export function airQualityCardHeight(s: number, u: number): number {
  return Math.max(s * 17, s * 10.5 + u * 10.8);
}
