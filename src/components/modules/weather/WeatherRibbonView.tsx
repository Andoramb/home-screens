'use client';

import { useId } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { tempColor } from '@/lib/weather/temp-ramp';
import { isNightHour } from '@/lib/weather/sun-times';
import { hourLabel, smoothPath, spanHours, tzHour } from '../fullscreen-weather/weather-view-utils';
import { RAIN_COLOR, RainLegend, useSunTimes, useViewBox } from './chart-parts';
import { WeatherEmptyState } from './WeatherEmptyState';
import type { WeatherViewProps } from './types';

/** Rain chance below this draws no bar under the curve. */
const RAIN_SHOWN_PCT = 5;

/**
 * The temperature ribbon: the Panorama curve on its own.
 *
 * The next hours as a spline coloured by the temperature ramp, with night
 * hours shaded, a mark at sunrise (amber) and sunset (violet), each run's
 * warmest and coldest hour labelled, rain chance as bars under the baseline,
 * and a mark at the current reading. The chart is drawn in CSS pixels on a
 * viewBox the size of its box, so text is never stretched and sizes follow
 * the module's fitted text size like everything else in the module.
 */
export default function WeatherRibbonView({ config, hourly, units, timezone, timeFormat, scaledFontSize, latitude, longitude }: WeatherViewProps) {
  const t = useTranslate('modules');
  const sun = useSunTimes(latitude, longitude, timezone);
  const [chartRef, chart] = useViewBox();
  const uid = useId();
  const hrs = hourly.slice(0, Math.max(2, config.hoursToShow || 8));
  const now = hourly[0];
  const showTitle = config.showTitle !== false;

  return (
    <div className="w-full h-full flex flex-col" style={{ fontSize: `${scaledFontSize}px` }}>
      {showTitle && (
        /* The header is a container query root (em here is its own fitted
           size): the condition goes first when the row is under 23em, then the
           hour span under 16em, then the legend under 10em, so a small box
           keeps its temperature instead of "Part…" or "Next 12 hours" drawn
           across the figure. The hour axis under the chart still tells the span. */
        <div className="@container flex items-baseline justify-between gap-[1em] shrink-0 mb-[0.3em]">
          {now ? (
            <div className="flex items-baseline gap-[0.5em] min-w-0">
              <span className="font-light leading-none tabular-nums" style={{ fontSize: '2em' }}>{Math.round(now.temp)}&deg;</span>
              <span className="truncate capitalize @max-[23em]:hidden" style={{ fontSize: '0.9em', opacity: TEXT_OPACITY.secondary }}>{now.description}</span>
            </div>
          ) : <span />}
          <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-[0.8em] @max-[10em]:hidden" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.secondary }}>
            <span className="@max-[16em]:hidden">{t('fullscreen-weather.sections.nextHours', { hours: spanHours(hrs) })}</span>
            <RainLegend />
          </span>
        </div>
      )}
      {hrs.length < 2 ? (
        <div className="flex-1 flex items-center justify-center"><WeatherEmptyState /></div>
      ) : (
        <div ref={chartRef} className="flex-1 min-h-0 relative" data-testid="weather-ribbon">
          {chart.width > 0 && chart.height > 0 && (
            <Ribbon
              hrs={hrs} width={chart.width} height={chart.height} fontSize={scaledFontSize}
              units={units} timezone={timezone} timeFormat={timeFormat} sun={sun} uid={uid}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Ribbon({ hrs, width: W, height: H, fontSize: fs, units, timezone, timeFormat, sun, uid }: {
  hrs: WeatherViewProps['hourly']; width: number; height: number; fontSize: number;
  units: 'metric' | 'imperial'; timezone?: string; timeFormat: '12h' | '24h';
  sun: ReturnType<typeof useSunTimes>; uid: string;
}) {
  const tempGradId = `${uid}-temp`;
  const areaGradId = `${uid}-area`;

  // Bands, top to bottom: headroom for the marks and callouts, the curve,
  // the rain bars, the hour axis. The rain band takes a share of what is
  // left after the fixed bands, floored so a bar is always visible.
  const TOP = fs * 1.3;
  const AXIS = fs * 1.1;
  const PB = Math.max(fs * 0.9, (H - TOP - AXIS) * 0.22);
  const CH = Math.max(fs * 2, H - TOP - AXIS - PB);
  const PAD = fs * 0.5;
  const baseline = TOP + CH;

  const N = hrs.length;
  const temps = hrs.map((h) => h.temp);
  const mn = Math.min(...temps) - 3;
  const mx = Math.max(...temps) + 3;
  const range = mx - mn || 1;
  const step = (W - PAD * 2) / Math.max(1, N - 1);
  const x = (i: number) => PAD + i * step;
  const y = (temp: number) => TOP + CH - ((temp - mn) / range) * (CH - fs * 0.5);

  const pts = hrs.map((h, i) => [x(i), y(h.temp)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${x(N - 1)},${baseline} L${x(0)},${baseline} Z`;

  const meta = hrs.map((h) => {
    const hour = tzHour(new Date(h.time), timezone);
    return { hour, isNight: isNightHour(hour, sun) };
  });

  const hiI = temps.indexOf(Math.max(...temps));
  const loI = temps.indexOf(Math.min(...temps));
  const labelPx = fs * 0.8;
  const labelGap = fs * 0.4;
  // Above the point when there is room, below it otherwise; an extreme at
  // either end is anchored inward so it cannot hang past the box, and at
  // the start it steps past the now mark.
  const callout = (i: number) => {
    const above = y(temps[i]) - labelGap;
    const fitsAbove = above - labelPx * 0.8 >= 0;
    const ty = fitsAbove ? above : Math.min(baseline - 2, y(temps[i]) + labelGap + labelPx * 0.85);
    const atStart = x(i) < W * 0.05;
    const atEnd = x(i) > W * 0.95;
    const anchor = atStart ? 'start' : atEnd ? 'end' : 'middle';
    const tx = atStart ? x(i) + fs * 0.5 : x(i);
    return (
      <text key={`c${i}`} x={tx} y={ty} fontSize={labelPx} fontWeight={600} fill="currentColor" textAnchor={anchor} data-testid="weather-ribbon-callout">
        {Math.round(temps[i])}&deg;
      </text>
    );
  };

  // Hour ticks: about eight across, the outermost anchored inward so a
  // centred label never hangs half outside the box.
  const tickEvery = Math.max(1, Math.round(N / 8));
  const axisLabels = meta.map((m, i) => {
    if (i % tickEvery !== 0) return null;
    const atStart = x(i) < W * 0.05;
    const atEnd = x(i) > W * 0.95;
    const anchor = atStart ? 'start' : atEnd ? 'end' : 'middle';
    const tx = atStart ? 1 : atEnd ? W - 1 : x(i);
    return (
      <text key={`a${i}`} x={tx} y={H - AXIS * 0.2} fontSize={fs * 0.7} fontWeight={500} fill="currentColor" opacity={TEXT_OPACITY.dim} textAnchor={anchor}>
        {hourLabel(Math.floor(m.hour), timeFormat)}
      </text>
    );
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block', overflow: 'visible' }} aria-hidden="true">
      <defs>
        <linearGradient id={tempGradId} x1="0" x2="1">
          {hrs.map((h, i) => (
            <stop key={i} offset={`${((i / Math.max(1, N - 1)) * 100).toFixed(1)}%`} stopColor={tempColor(h.temp, units)} />
          ))}
        </linearGradient>
        <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".14" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {meta.map((m, i) => m.isNight ? (
        <rect key={`n${i}`} x={x(i) - step / 2} y={0} width={step} height={baseline + PB} fill="currentColor" opacity={0.05} />
      ) : null)}

      {meta.map((m, i) => {
        if (i === 0) return null;
        const prev = meta[i - 1];
        if (prev.isNight && !m.isNight) {
          return <g key={`sr${i}`} data-testid="weather-ribbon-sunrise"><line x1={x(i)} y1={TOP * .55} x2={x(i)} y2={baseline} stroke="#f59e0b" strokeWidth={1.5} opacity=".55" /><circle cx={x(i)} cy={TOP * .55} r={fs * 0.22} fill="#f59e0b" /></g>;
        }
        if (!prev.isNight && m.isNight) {
          return <g key={`ss${i}`} data-testid="weather-ribbon-sunset"><line x1={x(i)} y1={TOP * .55} x2={x(i)} y2={baseline} stroke="#6366f1" strokeWidth={1.5} opacity=".55" /><circle cx={x(i)} cy={TOP * .55} r={fs * 0.22} fill="#6366f1" /></g>;
        }
        return null;
      })}

      <path d={area} fill={`url(#${areaGradId})`} />
      <path d={line} fill="none" stroke={`url(#${tempGradId})`} strokeWidth={Math.max(2.5, fs * 0.22)} strokeLinecap="round" strokeLinejoin="round" />

      {hrs.map((h, i) => {
        const pop = (h.precipProbability ?? 0) / 100;
        if (pop * 100 < RAIN_SHOWN_PCT) return null;
        const bw = step * 0.62;
        return <rect key={`p${i}`} x={x(i) - bw / 2} y={baseline + 3} width={bw} height={Math.max(2, pop * (PB - 6))} rx={2} fill={RAIN_COLOR} opacity={0.35 + pop * 0.6} />;
      })}

      {axisLabels}
      {callout(hiI)}
      {hiI !== loI && callout(loI)}

      <line x1={x(0)} y1={TOP * .5} x2={x(0)} y2={baseline + PB} stroke="currentColor" strokeWidth={2} opacity=".5" />
      <circle cx={x(0)} cy={y(temps[0])} r={fs * 0.3} fill="currentColor" stroke="rgba(0,0,0,.55)" strokeWidth={2.5} />
    </svg>
  );
}
