'use client';

import { floorEase, type WeatherViewProps } from './weather-view-utils';
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
      {cards.length > 0 && (
        <div style={{ flex: 1, minHeight: Math.max(u * 24, s * 24 * ease), display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: u * 2.2 }}>
          {cards.map((card) => <Instrument key={card} p={p} card={card} ctx={{ land: false }} />)}
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
  const middle: Array<{ col: string; row: string }> = aq
    ? [{ col: '5 / 9', row: '2' }]
    : [{ col: '5 / 7', row: '2' }, { col: '7 / 9', row: '2' }];
  if (!showMap) middle.push({ col: '9 / 11', row: '2' }, { col: '11 / 13', row: '2' });
  const bottom: Array<{ col: string; row: string }> = [
    { col: '5 / 7', row: '3' }, { col: '7 / 9', row: '3' }, { col: '9 / 11', row: '3' }, { col: '11 / 13', row: '3' },
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
  return (
    <>
      <Hero p={p} land />
      <AlertBand p={p} />
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap,
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        gridTemplateRows: 'minmax(0, 212fr) minmax(0, 170fr) minmax(0, 308fr)',
      }}>
        <HourlyCard p={p} count={12} style={{ gridColumn: showMap ? '1 / 9' : '1 / 13', gridRow: '1', flex: 'none' }} />
        {showMap && <MapCard p={p} land style={{ gridColumn: '9 / 13', gridRow: '1 / 3' }} />}
        <DaysCard p={p} land style={{ gridColumn: '1 / 5', gridRow: '2 / 4', minHeight: 0 }} />
        {placed.map(({ card, cell }) => (
          <Instrument key={card} p={p} card={card} ctx={{ land: true }} style={{ gridColumn: cell.col, gridRow: cell.row }} />
        ))}
      </div>
    </>
  );
}
