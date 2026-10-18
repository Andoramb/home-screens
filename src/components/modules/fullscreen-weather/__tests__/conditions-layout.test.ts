import { describe, it, expect } from 'vitest';
import {
  conditionsGrid, packCardRows, airQualityCardHeight, CARD_MIN_S, PORTRAIT_CARD_RATIO, LANDSCAPE_CARD_RATIO,
} from '../conditions-layout';
import type { FullscreenWeatherCard } from '@/types/config';

const portrait = { width: 1080, height: 1920, aboveHeight: 400, s: 10, u: 10, land: false, bannerRows: 0 };
const landscape = { width: 1920, height: 1080, aboveHeight: 160, s: 10, u: 10, land: true, bannerRows: 0 };

const spans = (rows: ReturnType<typeof packCardRows>) => rows.map((r) => r.cards.map((c) => `${c.card}:${c.span}`));

describe('packCardRows', () => {
  it('lays the cards two across in portrait, in the order given', () => {
    const rows = packCardRows(['moon', 'uv', 'feelsLike', 'wind', 'sun'], 2, false);
    expect(spans(rows)).toEqual([['moon:1', 'uv:1'], ['feelsLike:1', 'wind:1'], ['sun:2']]);
    expect(rows.map((r) => r.banner)).toEqual([false, false, false]);
  });

  it('gives air quality the whole portrait row wherever it sits, as the banner', () => {
    const rows = packCardRows(['moon', 'airQuality', 'uv', 'wind'], 2, false);
    expect(spans(rows)).toEqual([['moon:2'], ['airQuality:2'], ['uv:1', 'wind:1']]);
    expect(rows.map((r) => r.banner)).toEqual([false, true, false]);
  });

  it('widens the card left alone beside the banner, so no row has a hole', () => {
    const rows = packCardRows(['moon', 'uv', 'feelsLike', 'airQuality'], 2, false);
    expect(spans(rows)).toEqual([['moon:1', 'uv:1'], ['feelsLike:2'], ['airQuality:2']]);
  });

  it('packs four across in landscape with air quality on two cells, never a banner', () => {
    const rows = packCardRows(['airQuality', 'moon', 'uv', 'feelsLike', 'wind'], 4, true);
    expect(spans(rows)).toEqual([['airQuality:2', 'moon:1', 'uv:1'], ['feelsLike:2', 'wind:2']]);
    expect(rows.every((r) => !r.banner)).toBe(true);
  });

  it('leads a landscape row of three with a double when air quality does not fit', () => {
    const rows = packCardRows(['moon', 'uv', 'feelsLike', 'airQuality', 'wind'], 4, true);
    expect(spans(rows)).toEqual([['moon:2', 'uv:1', 'feelsLike:1'], ['airQuality:2', 'wind:2']]);
  });

  it('never stretches a card past two cells: the end of a short last row stays empty', () => {
    expect(spans(packCardRows(['moon'], 4, true))).toEqual([['moon:2']]);
    expect(spans(packCardRows(['moon', 'uv', 'feelsLike', 'wind', 'sun'], 4, true))).toEqual([['moon:1', 'uv:1', 'feelsLike:1', 'wind:1'], ['sun:2']]);
  });

  it('draws nothing for an empty list', () => {
    expect(packCardRows([], 2, false)).toEqual([]);
  });

  it('fills a fixed set of rows in order and drops the cards past the last cell (the Forecast tablet grid)', () => {
    const rows = packCardRows(['wind', 'sun', 'moon', 'uv', 'feelsLike', 'humidity', 'pressure'], [2, 4], true);
    expect(spans(rows)).toEqual([['wind:1', 'sun:1'], ['moon:1', 'uv:1', 'feelsLike:1', 'humidity:1']]);
  });

  it('gives air quality two cells of the fixed rows wherever it lands, widening the card it pushes', () => {
    expect(spans(packCardRows(['airQuality', 'moon', 'uv'], [2, 4], true))).toEqual([['airQuality:2'], ['moon:2', 'uv:2']]);
    expect(spans(packCardRows(['wind', 'airQuality', 'moon', 'uv', 'sun'], [2, 4], true))).toEqual([['wind:2'], ['airQuality:2', 'moon:1', 'uv:1']]);
    expect(spans(packCardRows(['wind', 'sun', 'moon', 'uv', 'feelsLike', 'airQuality'], [2, 4], true))).toEqual([['wind:1', 'sun:1'], ['moon:2', 'uv:1', 'feelsLike:1']]);
  });

  it('keeps every card exactly once', () => {
    const all: FullscreenWeatherCard[] = ['wind', 'sun', 'airQuality', 'moon', 'uv', 'feelsLike', 'precipitation', 'visibility', 'humidity', 'pressure', 'nowcast'];
    for (const [columns, land] of [[2, false], [4, true]] as const) {
      const drawn = packCardRows(all, columns, land).flatMap((r) => r.cards.map((c) => c.card));
      expect(drawn).toEqual(all);
    }
  });
});

describe('conditionsGrid', () => {
  it('caps a row near the square the phone draws, and floors it on the type unit', () => {
    const g = conditionsGrid({ ...portrait, rows: 2 });
    expect(g.columns).toBe(2);
    expect(g.cardCap).toBeCloseTo(g.cardWidth * PORTRAIT_CARD_RATIO);
    expect(g.rowMin).toBe(CARD_MIN_S * 10);
    const l = conditionsGrid({ ...landscape, rows: 2 });
    expect(l.columns).toBe(4);
    expect(l.cardCap).toBeCloseTo(l.cardWidth * LANDSCAPE_CARD_RATIO);
  });

  it('gives a row the shared slack, between its floor and its cap', () => {
    const few = conditionsGrid({ ...portrait, rows: 1 });
    expect(few.rowHeight).toBe(few.cardCap);
    const many = conditionsGrid({ ...portrait, rows: 5 });
    expect(many.rowHeight).toBeGreaterThan(many.rowMin);
    expect(many.rowHeight).toBeLessThan(many.cardCap);
    const crowded = conditionsGrid({ ...portrait, height: 900, rows: 5 });
    expect(crowded.rowHeight).toBe(crowded.rowMin);
  });

  it('takes the banner rows out of the slack before sharing it', () => {
    const without = conditionsGrid({ ...portrait, rows: 4 });
    const withBanner = conditionsGrid({ ...portrait, rows: 4, bannerRows: 1 });
    expect(withBanner.bannerHeight).toBe(airQualityCardHeight(10, 10));
    expect(withBanner.rowHeight).toBeLessThan(without.rowHeight);
  });

  it('has no card row height when every row is a banner', () => {
    expect(conditionsGrid({ ...portrait, rows: 0, bannerRows: 1 }).rowHeight).toBe(0);
  });

  it('never floors a row above its cap on a narrow box', () => {
    const g = conditionsGrid({ ...portrait, width: 300, s: 40, rows: 1 });
    expect(g.rowMin).toBeLessThanOrEqual(g.cardCap);
  });
});
