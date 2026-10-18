import type { FullscreenWeatherCard } from '@/types/config';
import { CANVAS_PAD_X_U, CANVAS_PAD_Y_U } from './weather-view-utils';

/**
 * How the Conditions view lays out its instrument grid.
 *
 * Every card that is on and that the weather source can fill is drawn, in
 * the order the module's card list gives: the list in the editor is the
 * whole story of what shows and where, so the view never withholds a card
 * for room. Two columns in portrait, four in landscape, and as many rows as
 * the cards need.
 *
 * Height: each row is at least `rowMin`, which is what the fit loop sees
 * when too many rows of large type do not fit (it shrinks the type), and at
 * most `cardCap`, the phone's near-square card, so a page with few cards
 * does not stretch them into towers. Between the two the rows share the
 * slack, since a wall has nothing to scroll into empty space. A portrait row
 * that is only the air quality card is the phone's banner and keeps the
 * banner's own height instead.
 *
 * Arithmetic over the scale, never a measurement: the fit loop measures the
 * stack after render.
 */

/** Card height over width at most. The phone's small cards are about square; the wider tablet cards a little flatter. */
export const PORTRAIT_CARD_RATIO = 0.86;
export const LANDSCAPE_CARD_RATIO = 0.78;
/** The least a card may be, in type units: padding, a label and a line (about 12.5) plus an instrument worth reading. */
export const CARD_MIN_S = 20;

/** A card's place in a row: how many columns it takes. */
export interface PackedCard { card: FullscreenWeatherCard; span: number }
export interface PackedRow {
  cards: PackedCard[];
  /** The portrait air quality banner: a row of its own at the banner's height, not a card row. */
  banner: boolean;
}

/** The columns the air quality card takes: the phone's banner is the full portrait width, and half the tablet's. */
const AIR_QUALITY_SPAN = 2;

/**
 * Lay the cards into rows of cells, in order. Air quality takes two cells,
 * every other card one. A card that does not fit the cells left in a row
 * starts the next one, and the cards before it widen to fill the row, from
 * the left and never past two cells, so no row has a hole in it: in
 * portrait a card left alone beside the air quality banner goes full width,
 * and in landscape a row of three before it leads with a double. Cells past
 * what two-wide cards can fill stay empty at the end of a row, which only
 * happens when the list runs out, since a lone card stretched across four
 * cells reads as a mistake rather than a layout.
 *
 * `columns` is the cells in every row (as many rows as the cards need), or
 * one count per row when the grid has a fixed set of rows, as the Forecast
 * page's tablet grid does: cards past the last row are not drawn.
 */
export function packCardRows(cards: readonly FullscreenWeatherCard[], columns: number | readonly number[], land: boolean): PackedRow[] {
  const capacity = (rowIndex: number): number | undefined => (typeof columns === 'number' ? columns : columns[rowIndex]);
  const rows: PackedRow[] = [];
  let row: PackedCard[] = [];
  let used = 0;
  const close = () => {
    if (row.length === 0) return;
    let spare = capacity(rows.length)! - used;
    for (const cell of row) {
      const grow = Math.min(spare, AIR_QUALITY_SPAN - cell.span);
      cell.span += grow;
      spare -= grow;
    }
    rows.push({ cards: row, banner: !land && row.length === 1 && row[0].card === 'airQuality' });
    row = [];
    used = 0;
  };
  for (const card of cards) {
    const cells = capacity(rows.length);
    if (cells === undefined) break;
    const span = card === 'airQuality' ? AIR_QUALITY_SPAN : 1;
    if (used + span > cells) {
      close();
      if (capacity(rows.length) === undefined) break;
    }
    row.push({ card, span });
    used += span;
    if (used === capacity(rows.length)) close();
  }
  close();
  return rows;
}

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
  /** Card rows, which share the slack. */
  rows: number;
  /** Portrait air quality banner rows, each at the banner's own height. */
  bannerRows: number;
}

export interface ConditionsGrid {
  columns: number;
  gap: number;
  /** A cell's width in px, from the columns. */
  cardWidth: number;
  /** The least and the most a card row may be, in px. */
  rowMin: number;
  cardCap: number;
  /** The height a card row should come out at: the slack shared, clamped between the two. Cards size their instruments from it. */
  rowHeight: number;
  /** The height of a banner row. */
  bannerHeight: number;
}

export function conditionsGrid(i: ConditionsGridInput): ConditionsGrid {
  const columns = i.land ? 4 : 2;
  const gap = i.u * 2;
  const contentWidth = i.width - 2 * i.u * CANVAS_PAD_X_U;
  const cardWidth = Math.max(0, (contentWidth - gap * (columns - 1)) / columns);
  const cardCap = cardWidth * (i.land ? LANDSCAPE_CARD_RATIO : PORTRAIT_CARD_RATIO);
  const rowMin = Math.min(cardCap, i.s * CARD_MIN_S);
  const bannerHeight = airQualityCardHeight(i.s, i.u);
  const allRows = i.rows + i.bannerRows;
  const contentHeight = i.height - 2 * i.u * CANVAS_PAD_Y_U;
  const room = contentHeight - i.aboveHeight - i.bannerRows * bannerHeight - gap * Math.max(0, allRows - 1);
  const rowHeight = i.rows > 0 ? Math.min(cardCap, Math.max(rowMin, room / i.rows)) : 0;
  return { columns, gap, cardWidth, rowMin, cardCap, rowHeight, bannerHeight };
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
