/**
 * Where a dish's picture goes in a Meal Planner week cell: beside its name, or
 * above it.
 *
 * Beside it, the picture and its gap come off the name's width. A 400px module
 * with four meals a day leaves 80px cells, and the picture took the name down
 * to 46px at 13px: "Pancakes" broke into "Pancak / es" and "Cheeseburgers"
 * into "Chees / ebur". A browser only hyphenates the words its dictionary
 * knows, and a Pi may carry no dictionary at all, so what the name needs is the
 * room rather than a better place to break. Below about seven letters of its
 * own type the picture moves up and the name gets the whole cell.
 */

/** The fewest letters of a dish name the line beside its picture has to hold. */
const NAME_MIN_CHARS = 7;
/** An average letter of a dish name, in em of its size. */
const NAME_CHAR_EM = 0.55;
/** The name's two clamped lines, at the line height the view draws them at. */
const NAME_LINES = 2;
const NAME_LINE_HEIGHT = 1.2;
/** The gap the view draws between the picture and the name, either way round. */
export const WEEK_PICTURE_GAP_PX = 4;

export interface WeekCellRoom {
  /** The cell's width inside its padding. Zero until the view has been measured. */
  cellPx: number;
  /** The cell's height inside its padding. */
  rowPx: number;
  /** The dish name's type size. */
  namePx: number;
  /** The picture's box: its width beside the name, its line above it. Zero for none. */
  picturePx: number;
  /** Whatever else sits beside the name (the serving time), gap included. */
  besidePx: number;
}

/**
 * True when the picture goes above the name.
 *
 * Only when the line beside it is too narrow for the name, and only in a row
 * tall enough for the picture over both of the name's lines: a short row keeps
 * the picture beside the name rather than spill into the next day. Unmeasured,
 * the cell keeps the layout it is authored with.
 */
export function pictureAboveName(room: WeekCellRoom): boolean {
  if (room.cellPx <= 0 || room.picturePx <= 0) return false;
  const beside = room.cellPx - room.besidePx - room.picturePx - WEEK_PICTURE_GAP_PX;
  if (beside >= NAME_MIN_CHARS * NAME_CHAR_EM * room.namePx) return false;
  const stacked = room.picturePx + WEEK_PICTURE_GAP_PX + NAME_LINES * NAME_LINE_HEIGHT * room.namePx;
  return stacked <= room.rowPx;
}
