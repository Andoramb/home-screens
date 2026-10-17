import { describe, it, expect } from 'vitest';
import { conditionsGrid, CARD_MIN_S, PORTRAIT_CARD_RATIO, LANDSCAPE_CARD_RATIO } from '../conditions-layout';

const portrait = { width: 1080, height: 1920, aboveHeight: 400, s: 10, u: 10, land: false, airQualityInGrid: false };
const landscape = { width: 1920, height: 1080, aboveHeight: 160, s: 10, u: 10, land: true, airQualityInGrid: true };

describe('conditionsGrid', () => {
  it('draws every card: rows come from the count, two across in portrait', () => {
    expect(conditionsGrid({ ...portrait, cardCount: 10 }).rows).toBe(5);
    expect(conditionsGrid({ ...portrait, cardCount: 3 }).rows).toBe(2);
    expect(conditionsGrid({ ...portrait, cardCount: 0 }).rows).toBe(0);
  });

  it('four across in landscape, with air quality taking two cells of the first row', () => {
    expect(conditionsGrid({ ...landscape, cardCount: 10 }).rows).toBe(3);
    expect(conditionsGrid({ ...landscape, cardCount: 2 }).rows).toBe(1);
    expect(conditionsGrid({ ...landscape, airQualityInGrid: false, cardCount: 8 }).rows).toBe(2);
  });

  it('caps a row near the square the phone draws, and floors it on the type unit', () => {
    const g = conditionsGrid({ ...portrait, cardCount: 4 });
    expect(g.cardCap).toBeCloseTo(g.cardWidth * PORTRAIT_CARD_RATIO);
    expect(g.rowMin).toBe(CARD_MIN_S * 10);
    const l = conditionsGrid({ ...landscape, cardCount: 4 });
    expect(l.cardCap).toBeCloseTo(l.cardWidth * LANDSCAPE_CARD_RATIO);
  });

  it('gives a row the shared slack, between its floor and its cap', () => {
    const few = conditionsGrid({ ...portrait, cardCount: 2 });
    expect(few.rowHeight).toBe(few.cardCap);
    const many = conditionsGrid({ ...portrait, cardCount: 10 });
    expect(many.rowHeight).toBeGreaterThan(many.rowMin);
    expect(many.rowHeight).toBeLessThan(many.cardCap);
    const crowded = conditionsGrid({ ...portrait, height: 900, cardCount: 10 });
    expect(crowded.rowHeight).toBe(crowded.rowMin);
  });

  it('never floors a row above its cap on a narrow box', () => {
    const g = conditionsGrid({ ...portrait, width: 300, s: 40, cardCount: 2 });
    expect(g.rowMin).toBeLessThanOrEqual(g.cardCap);
  });
});
