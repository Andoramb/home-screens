'use client';

import type { WeatherViewProps } from './weather-view-utils';
import { AlertBand } from './weather-parts';
import { Hero, Instrument, AirQualityCard, availableCards, cardAvailable, type CardKey } from './cards';
import { conditionsGrid, compactHeroHeight, alertBandHeight, airQualityCardHeight } from './conditions-layout';

/**
 * The second screen of the phone weather page: air quality across the top,
 * then the instrument cards two across (four in landscape, with air quality
 * taking two cells of the first row). Every card that is on is drawn; a
 * card hides itself only when the weather source cannot fill it, and the
 * grid closes up. The phone's order, with wind and sunrise last because the
 * Forecast page leads with those two.
 */
const ORDER: readonly CardKey[] = ['moon', 'uv', 'feelsLike', 'precipitation', 'visibility', 'humidity', 'pressure', 'nowcast', 'wind', 'sun'];

export default function ConditionsView(p: WeatherViewProps) {
  const { s, u } = p.scale;
  const land = p.scale.orientation === 'landscape';
  const aq = cardAvailable(p, 'airQuality');
  const cards = availableCards(p, ORDER);
  const alert = p.config.showAlerts !== false && p.alerts.length > 0;
  const stackGap = u * 2;
  const aboveHeight = compactHeroHeight(s, u, land) + stackGap
    + (alert ? alertBandHeight(s, u) + stackGap : 0)
    + (aq && !land ? airQualityCardHeight(s, u) + stackGap : 0);
  const grid = conditionsGrid({
    width: p.scale.width, height: p.scale.height, s, u, land, aboveHeight,
    airQualityInGrid: aq && land, cardCount: cards.length,
  });
  const { rows, columns, gap, cardWidth, rowMin, cardCap, rowHeight } = grid;
  // The instruments size themselves from the row they will get, not its floor.
  const ctx = { land, width: cardWidth, height: rowHeight };

  return (
    <>
      <Hero p={p} compact land={land} />
      <AlertBand p={p} />
      {aq && !land && <AirQualityCard p={p} ctx={{ land: false }} style={{ flex: 'none', minHeight: s * 17 }} />}
      {cards.length === 0 && !aq ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fsw-text-3)', fontSize: s * 2.2 }}>
          {p.t('fullscreen-weather.cards.nothingToShow')}
        </div>
      ) : (
        // Rows share the slack up to the near-square cap; below the floor the
        // fit loop shrinks the type (the min height is what it measures).
        <div style={{
          flex: 1, minHeight: rowMin * rows + gap * (rows - 1), display: 'grid', gap, alignContent: 'start',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(${rowMin}px, ${cardCap}px))`,
        }}>
          {aq && land && <AirQualityCard p={p} ctx={{ land: true, width: cardWidth * 2 + gap, height: rowHeight }} style={{ gridColumn: 'span 2' }} />}
          {cards.map((card) => <Instrument key={card} p={p} card={card} ctx={ctx} />)}
        </div>
      )}
    </>
  );
}
