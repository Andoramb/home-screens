'use client';

import { CloudRain, Wind } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useTZClock } from '@/hooks/useTZClock';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { localISODate } from '@/lib/timezone';
import { getWeatherIcon } from '@/lib/weather-icons';
import { WeatherStat } from '../WeatherStat';
import { dayLabel } from './day-label';
import { getLocalizedConditionLabel } from './condition-label';
import { WeatherEmptyState } from './WeatherEmptyState';
import type { WeatherViewProps } from './types';

/**
 * The written forecast: one row per day with its icon, the day's name and
 * high and low, and the sentence or two the provider wrote about it. Only
 * the US National Weather Service writes one (`detailedForecast`); for any
 * other provider the row carries the short condition with the rain chance
 * and wind beside it, so the view never goes blank.
 */
export default function WeatherNarrativeView({ config, forecast, timezone, scaledFontSize }: WeatherViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const tWeather = useTranslate('weather');
  const locale = useFormattingLocale();
  const todayISO = localISODate(useTZClock(timezone, 60_000));
  const days = forecast.slice(0, Math.max(1, config.daysToShow || 5));
  const labels = { today: tCore('today'), tomorrowShort: t('weather.tomorrowShort') };
  const showHighLow = config.showHighLow !== false;

  const { boxRef, contentRef, fontSize } = useFitFontSize(
    scaledFontSize,
    [days.length, days.map((d) => d.detailedForecast?.length ?? 0).join(','), showHighLow, config.showTitle !== false, config.showRelativeDayLabels !== false].join('|'),
  );

  return (
    <div ref={boxRef} className="w-full h-full overflow-hidden" style={{ fontSize: `${fontSize}px` }}>
      {/* Title and rows measured together: the rows take their natural
          height and run past the box when they do not fit. */}
      <div ref={contentRef} className="flex flex-col">
        {config.showTitle !== false && (
          <h2 className="font-semibold mb-[0.35em] shrink-0" style={{ fontSize: '1.125em', opacity: TEXT_OPACITY.heading }}>{t('weather.forecast')}</h2>
        )}
        {days.length === 0 ? (
          <WeatherEmptyState message={t('weather.noForecastData')} />
        ) : (
          <div className="flex flex-col gap-[0.6em]">
            {days.map((day) => {
              const Icon = getWeatherIcon(day.icon, config.iconSet);
              return (
                <div key={day.date} data-weather-day={day.date} className="grid gap-x-[0.8em] gap-y-[0.15em] items-start" style={{ gridTemplateColumns: 'auto 1fr' }}>
                  <div className="row-span-2 flex items-center pt-[0.15em]" style={{ fontSize: '2.1em' }}>
                    <Icon size="1em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(day.icon, tWeather)} role="img" />
                  </div>
                  <div className="flex items-baseline gap-[0.6em] font-semibold" style={{ fontSize: '0.95em' }}>
                    <span>{dayLabel(day.date, todayISO, locale, labels, config.showRelativeDayLabels !== false)}</span>
                    {showHighLow && (
                      <span className="font-normal tabular-nums" style={{ fontSize: '0.9em', opacity: TEXT_OPACITY.dim }}>
                        {t('weather.highLow', { high: `${Math.round(day.high)}°`, low: `${Math.round(day.low)}°` })}
                      </span>
                    )}
                  </div>
                  {day.detailedForecast ? (
                    <p data-testid="weather-narrative-text" style={{ fontSize: '0.85em', lineHeight: 1.4, opacity: TEXT_OPACITY.heading }}>{day.detailedForecast}</p>
                  ) : (
                    <div className="flex items-center gap-[0.8em] flex-wrap" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.heading }}>
                      <span className="capitalize">{day.description}</span>
                      <WeatherStat icon={CloudRain} value={day.precipProbability} unit="%" visible fontSize="0.85em" />
                      <WeatherStat icon={Wind} value={day.windSpeed} visible={day.windSpeed != null} fontSize="0.85em" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
