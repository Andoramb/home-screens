'use client';

import type { WeatherViewProps } from './weather-view-utils';
import { AlertBand } from './weather-parts';
import { Hero, Instrument, availableCards } from './cards';
import { conditionsGrid, packCardRows, compactHeroHeight, alertBandHeight } from './conditions-layout';

/**
 * The second screen of the phone weather page: the instrument cards two
 * across (four in landscape), in the order the module's card list gives.
 * Every card on the list is drawn; a card hides itself only when the weather
 * source cannot fill it, and the grid closes up. Air quality keeps the
 * phone's wide banner shape wherever the list puts it: the full width in
 * portrait, two cells in landscape (see packCardRows).
 */
export default function ConditionsView(p: WeatherViewProps) {
  const { s, u } = p.scale;
  const land = p.scale.orientation === 'landscape';
  const cards = availableCards(p);
  const alert = p.config.showAlerts !== false && p.alerts.length > 0;
  const stackGap = u * 2;
  const aboveHeight = compactHeroHeight(s, u, land) + stackGap
    + (alert ? alertBandHeight(s, u) + stackGap : 0);
  const columns = land ? 4 : 2;
  const rows = packCardRows(cards, columns, land);
  const bannerRows = rows.filter((r) => r.banner).length;
  const grid = conditionsGrid({
    width: p.scale.width, height: p.scale.height, s, u, land, aboveHeight,
    rows: rows.length - bannerRows, bannerRows,
  });
  const { gap, cardWidth, rowMin, cardCap, rowHeight, bannerHeight } = grid;
  const cellWidth = (span: number) => cardWidth * span + gap * (span - 1);
  const templateRows = rows.map((r) => (r.banner ? `${bannerHeight}px` : `minmax(${rowMin}px, ${cardCap}px)`)).join(' ');
  const minHeight = rows.reduce((sum, r) => sum + (r.banner ? bannerHeight : rowMin), 0) + gap * Math.max(0, rows.length - 1);

  return (
    <>
      <Hero p={p} compact land={land} />
      <AlertBand p={p} />
      {rows.length === 0 ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fsw-text-3)', fontSize: s * 2.2 }}>
          {p.t('fullscreen-weather.cards.nothingToShow')}
        </div>
      ) : (
        // Card rows share the slack up to the near-square cap; below the
        // floor the fit loop shrinks the type (the min height is what it
        // measures). The banner rows keep their own height.
        <div style={{
          flex: 1, minHeight, display: 'grid', gap, alignContent: 'start',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: templateRows,
        }}>
          {rows.flatMap((row) => row.cards.map(({ card, span }) => (
            <Instrument
              key={card}
              p={p}
              card={card}
              // The instruments size themselves from the cell they will get,
              // not its floor. The portrait banner lays itself out like the
              // phone's (no cell) and keeps its floor.
              ctx={row.banner ? { land: false } : { land, width: cellWidth(span), height: rowHeight }}
              style={{
                ...(span > 1 ? { gridColumn: `span ${span}` } : {}),
                ...(row.banner ? { flex: 'none', minHeight: s * 17 } : {}),
              }}
            />
          )))}
        </div>
      )}
    </>
  );
}
