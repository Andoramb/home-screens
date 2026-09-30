'use client';

import { CloudRain, Droplets, Wind } from 'lucide-react';
import { getWeatherIcon } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useElementBox } from '@/hooks/useElementBox';
import { WeatherStat } from '../WeatherStat';
import { WeatherEmptyState } from './WeatherEmptyState';
import { getLocalizedConditionLabel } from './condition-label';
import type { WeatherViewProps } from './types';

/**
 * The narrowest an hour column is drawn, in em of the view's size: its widest
 * line is the time ("12 AM") or the rain chance with its icon ("35%").
 */
const HOUR_COLUMN_EM = 2.5;
/** The gap between hour columns, in em. */
const HOUR_GAP_EM = 0.35;

/** How many hour columns a row this wide holds whole. */
export function hoursThatFit(rowWidthPx: number, fontSizePx: number): number {
  if (!(rowWidthPx > 0) || !(fontSizePx > 0)) return Infinity;
  const column = HOUR_COLUMN_EM * fontSizePx;
  const gap = HOUR_GAP_EM * fontSizePx;
  return Math.max(1, Math.floor((rowWidthPx + gap) / (column + gap)));
}

export default function WeatherHourlyView({ config, hourly, forecast, timezone, timeFormat, scaledFontSize }: WeatherViewProps) {
  const hours = hourly.slice(0, config.hoursToShow);
  // Only the hours that fit whole are drawn: the row used to be sliced by the
  // card's edge, with half an hour showing and the rest hidden. The row is
  // measured, and the count follows it as the card is resized.
  const [rowRef, rowBox] = useElementBox<HTMLDivElement>();
  const upcoming = hours.slice(1, 1 + hoursThatFit(rowBox.width, scaledFontSize));
  const locale = useFormattingLocale();
  const t = useTranslate('modules');
  const tWeather = useTranslate('weather');

  return (
    <div className="w-full h-full flex flex-col" style={{ fontSize: `${scaledFontSize}px` }}>
      {config.showTitle !== false && (
        <h2 className="font-semibold mb-3 shrink-0" style={{ fontSize: '1.125em', opacity: TEXT_OPACITY.heading }}>{t('weather.hourlyForecast')}</h2>
      )}
      {hours.length === 0 ? (
        <WeatherEmptyState />
      ) : (
        <div className="flex items-center gap-5 flex-1 min-h-0">
          {/* Current weather - large */}
          <div className="flex flex-col items-center justify-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-light" style={{ fontSize: '3em' }}>{Math.round(hours[0].temp)}&deg;</span>
              {(() => { const Icon = getWeatherIcon(hours[0].icon, config.iconSet); return <Icon size="2.5em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(hours[0].icon, tWeather)} role="img" />; })()}
            </div>
            <div className="flex flex-col items-center gap-0.5">
              {forecast[0] && (
                <span style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>
                  {t('weather.highLow', { high: `${Math.round(forecast[0].high)}°`, low: `${Math.round(forecast[0].low)}°` })}
                </span>
              )}
              {config.showFeelsLike !== false && hours[0].feelsLike != null && (
                <span style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>
                  {t('weather.feelsLike', { temp: `${Math.round(hours[0].feelsLike)}°` })}
                </span>
              )}
              <WeatherStat icon={Droplets} value={hours[0].humidity} unit="%" visible={config.showHumidity} fontSize="0.85em" />
              <WeatherStat icon={Wind} value={hours[0].windSpeed} visible={config.showWind} fontSize="0.85em" />
            </div>
          </div>

          {/* Divider */}
          <div className="self-stretch w-px opacity-30 bg-current shrink-0" />

          {/* Upcoming hours, as many as fit whole. */}
          <div ref={rowRef} className="flex flex-1 min-w-0 min-h-0 items-stretch justify-around gap-x-[0.35em] overflow-hidden" data-testid="weather-hours">
            {upcoming.map((hour, i) => {
              const Icon = getWeatherIcon(hour.icon, config.iconSet);
              return (
                <div key={i} className="flex flex-col items-center justify-evenly min-h-0 whitespace-nowrap">
                  <span style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.secondary }}>
                    {new Date(hour.time).toLocaleTimeString(locale, {
                      hour: 'numeric',
                      hour12: timeFormat !== '24h',
                      ...(timezone ? { timeZone: timezone } : {}),
                    })}
                  </span>
                  <Icon size="1.8em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(hour.icon, tWeather)} role="img" />
                  <WeatherStat icon={CloudRain} value={hour.precipProbability} unit="%" visible={config.showPrecipitation !== false} />
                  <span className="font-medium" style={{ fontSize: '0.875em' }}>{Math.round(hour.temp)}&deg;</span>
                  <WeatherStat icon={Droplets} value={hour.humidity} unit="%" visible={config.showHumidity} />
                  <WeatherStat icon={Wind} value={hour.windSpeed} visible={config.showWind} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
