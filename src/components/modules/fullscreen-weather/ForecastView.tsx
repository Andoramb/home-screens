'use client';

import { useRef } from 'react';
import { floorEase, type WeatherViewProps } from './weather-view-utils';
import { useBoxSize } from './useBoxSize';
import { AlertBand } from './weather-parts';
import {
  Hero, HourlyCard, DaysCard, MapCard, Instrument, availableCards, type CardKey,
} from './cards';

/**
 * The phone weather app's page, as a wall.
 *
 * Portrait is the phone: hero, hour strip, day list, the rain map, and two
 * instrument cards. Landscape is the tablet arrangement: the hero across the
 * top, the hour strip beside the map, then the day list, air quality and
 * four instrument cards. The rest of the phone's page is the Conditions
 * view, which rotates in as a second screen.
 */
export default function ForecastView(p: WeatherViewProps) {
  return p.scale.orientation === 'landscape' ? <ForecastLandscape p={p} /> : <ForecastPortrait p={p} />;
}

/** The two cards under the map, in the phone's order, from whatever this wall can fill. */
const PORTRAIT_ORDER: readonly CardKey[] = ['wind', 'sun', 'moon', 'uv', 'feelsLike', 'precipitation', 'visibility', 'humidity', 'pressure', 'airQuality'];
/** The tablet's small cards, in its order. */
const LANDSCAPE_ORDER: readonly CardKey[] = ['uv', 'sun', 'wind', 'precipitation', 'feelsLike', 'humidity', 'visibility', 'pressure', 'moon', 'nowcast'];
/** Cards that are a number and a line, which fit the tablet's short middle row. */
const SHORT_CARDS: ReadonlySet<CardKey> = new Set(['uv', 'feelsLike', 'humidity', 'visibility', 'precipitation']);

function ForecastPortrait({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  // The type-unit floors give way near the fit loop's floor (see floorEase).
  const ease = floorEase(p.scale.fit);
  const showMap = p.config.showMap !== false && p.latitude != null && p.longitude != null;
  const cards = availableCards(p, PORTRAIT_ORDER).slice(0, 2);
  // The bottom row takes whatever the cards above leave, so its cards learn
  // their cell from the row's measured box and size their instruments to it,
  // as the Conditions grid does; the row's height never follows its content.
  const rowRef = useRef<HTMLDivElement>(null);
  const row = useBoxSize(rowRef);
  const gap = u * 2.2;
  const cell = row ? { width: (row.w - gap * (cards.length - 1)) / cards.length, height: row.h } : {};
  return (
    <>
      <Hero p={p} />
      <AlertBand p={p} />
      <HourlyCard p={p} count={8} />
      {/* The day list takes what the hero, the hours and the map leave and
          sheds days from the end when that is short (see DaysCard), so the
          map can be the phone's near-square card instead of a letterbox. */}
      <DaysCard p={p} style={{ flex: showMap ? 1.2 : 2.2 }} />
      {/* Floors on `s`, not only `u`: the fit loop shrinks structure fastest,
          and a map or a compass sized off `u` alone collapses to a sliver
          beside large type instead of making the loop shrink the type. */}
      {showMap && <MapCard p={p} style={{ flex: 'none', height: Math.max(u * 40, s * 26 * ease) }} />}
      {/* The floor seats a label, an instrument of 14.5 s and the line under it
          (see instrumentSize); the fit loop shrinks the type to make it so.
          This floor does not ease toward the fit floor: the instruments size
          to the row now, and a shorter row only starves them. */}
      {cards.length > 0 && (
        <div ref={rowRef} style={{ flex: 1, minHeight: Math.max(u * 24, s * 27), display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap }}>
          {cards.map((card) => <Instrument key={card} p={p} card={card} ctx={{ land: false, ...cell }} />)}
        </div>
      )}
    </>
  );
}

function ForecastLandscape({ p }: { p: WeatherViewProps }) {
  const { u } = p.scale;
  const showMap = p.config.showMap !== false && p.latitude != null && p.longitude != null;
  const aq = availableCards(p, ['airQuality']).length > 0;
  const small = availableCards(p, LANDSCAPE_ORDER);
  // The cells to the right of the day list: a short middle row (air quality
  // across it when there is data, else two cells, plus two more beside them
  // when there is no map) and four tall cells along the bottom. The middle
  // row takes the cards that are a number and a line; a compass or a sun arc
  // there would have no room to draw.
  const middle: Cell[] = aq
    ? [{ col: 5, span: 4, row: 2 }]
    : [{ col: 5, span: 2, row: 2 }, { col: 7, span: 2, row: 2 }];
  if (!showMap) middle.push({ col: 9, span: 2, row: 2 }, { col: 11, span: 2, row: 2 });
  const bottom: Cell[] = [
    { col: 5, span: 2, row: 3 }, { col: 7, span: 2, row: 3 }, { col: 9, span: 2, row: 3 }, { col: 11, span: 2, row: 3 },
  ];
  const middleCards: CardKey[] = aq ? ['airQuality'] : [];
  const rest = [...small];
  for (let i = 0; middleCards.length < middle.length && i < rest.length;) {
    if (SHORT_CARDS.has(rest[i])) middleCards.push(...rest.splice(i, 1));
    else i++;
  }
  const bottomCards = rest.slice(0, bottom.length);
  const placed = [
    ...middleCards.map((card, i) => ({ card, cell: middle[i] })),
    ...bottomCards.map((card, i) => ({ card, cell: bottom[i] })),
  ];
  const gap = u * 2;
  // The grid's rows and columns come from the box it gets, so each card's
  // cell follows from the grid's measured size; the instruments size to it.
  const gridRef = useRef<HTMLDivElement>(null);
  const grid = useBoxSize(gridRef);
  const cellSize = (cell: Cell) => {
    if (!grid) return {};
    const colW = (grid.w - gap * 11) / 12;
    const rowsH = grid.h - gap * (LANDSCAPE_ROWS.length - 1);
    const total = LANDSCAPE_ROWS.reduce((a, b) => a + b, 0);
    return { width: colW * cell.span + gap * (cell.span - 1), height: rowsH * LANDSCAPE_ROWS[cell.row - 1] / total };
  };
  return (
    <>
      <Hero p={p} land />
      <AlertBand p={p} />
      <div ref={gridRef} style={{
        flex: 1, minHeight: 0, display: 'grid', gap,
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        gridTemplateRows: LANDSCAPE_ROWS.map((r) => `minmax(0, ${r}fr)`).join(' '),
      }}>
        <HourlyCard p={p} count={12} style={{ gridColumn: showMap ? '1 / 9' : '1 / 13', gridRow: '1', flex: 'none' }} />
        {showMap && <MapCard p={p} land style={{ gridColumn: '9 / 13', gridRow: '1 / 3' }} />}
        <DaysCard p={p} land style={{ gridColumn: '1 / 5', gridRow: '2 / 4', minHeight: 0 }} />
        {placed.map(({ card, cell }) => (
          <Instrument key={card} p={p} card={card} ctx={{ land: true, ...cellSize(cell) }} style={{ gridColumn: `${cell.col} / ${cell.col + cell.span}`, gridRow: String(cell.row) }} />
        ))}
      </div>
    </>
  );
}

/** A card's place in the tablet grid: its first column, how many it spans, its row. */
interface Cell { col: number; span: number; row: 1 | 2 | 3 }
/** The tablet grid's row shares: the hour strip, the short middle row, the tall bottom row. */
const LANDSCAPE_ROWS = [212, 170, 308] as const;
