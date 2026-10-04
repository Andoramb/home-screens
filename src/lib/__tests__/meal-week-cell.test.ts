import { describe, expect, it } from 'vitest';
import { pictureAboveName, type WeekCellRoom } from '../meal-week-cell';

/**
 * A 400x660 module with four meals a day at 16px: 80.5px cells, 66.5px inside
 * their padding, and rows tall enough for a picture over two lines of name.
 */
const NARROW: WeekCellRoom = { cellPx: 66.5, rowPx: 80, namePx: 13, picturePx: 19.2, besidePx: 0 };

describe('pictureAboveName', () => {
  it('moves the picture above a name it would squeeze to under seven letters', () => {
    // Beside the picture the name had 46px at 13px, and "Pancakes" broke
    // into "Pancak / es".
    expect(pictureAboveName(NARROW)).toBe(true);
  });

  it('leaves the picture beside the name in a cell with room for both', () => {
    expect(pictureAboveName({ ...NARROW, cellPx: 120 })).toBe(false);
  });

  it('counts the serving time beside the name against it', () => {
    const roomy = { ...NARROW, cellPx: 90 };
    expect(pictureAboveName(roomy)).toBe(false);
    expect(pictureAboveName({ ...roomy, besidePx: 40 })).toBe(true);
  });

  it('has nothing to move when there is no picture', () => {
    expect(pictureAboveName({ ...NARROW, picturePx: 0 })).toBe(false);
  });

  it('keeps the authored layout until the view has been measured', () => {
    expect(pictureAboveName({ ...NARROW, cellPx: 0 })).toBe(false);
  });

  it('keeps the picture beside the name in a row too short to stack them', () => {
    // A picture over two lines of name is about 55px here, and a 400x300
    // module gives each day under 40: stacked, the cell would spill into the
    // next day's row.
    expect(pictureAboveName({ ...NARROW, rowPx: 34 })).toBe(false);
  });
});
