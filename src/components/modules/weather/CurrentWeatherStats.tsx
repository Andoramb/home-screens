'use client';

import { CloudRain, Droplets, Wind, Gauge, Eye, Thermometer, Sun, Sunrise, Sunset } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { WeatherStat } from '../WeatherStat';
import type { TimeFormat, WeatherConfig } from '@/types/config';
import type { HourlyWeather } from '@/lib/weather';
import { pressureForUnits } from '@/lib/weather/units';
import { formatTimeInTZ } from '@/lib/timezone';
import { useFormattingLocale } from '@/i18n';
import { useSunTimes } from './chart-parts';

interface CurrentWeatherStatsProps {
  config: WeatherConfig;
  current: HourlyWeather;
  units: 'metric' | 'imperial';
  fontSize: string;
  /** For the sunrise and sunset chips; without coordinates they stay hidden. */
  latitude?: number;
  longitude?: number;
  timezone?: string;
  timeFormat?: TimeFormat;
}

export function CurrentWeatherStats({ config, current, units, fontSize, latitude, longitude, timezone, timeFormat }: CurrentWeatherStatsProps) {
  const pressure = current.pressure != null ? pressureForUnits(current.pressure, units) : null;
  const locale = useFormattingLocale();
  const sun = useSunTimes(config.showSunTimes ? latitude : undefined, config.showSunTimes ? longitude : undefined, timezone);
  const clock = { timezone, locale, hour12: timeFormat !== '24h' };
  return (
    <>
      <WeatherStat icon={CloudRain} value={current.precipProbability} unit="%" visible={config.showPrecipitation !== false} fontSize={fontSize} />
      <WeatherStat icon={Droplets} value={current.humidity} unit="%" visible={config.showHumidity} fontSize={fontSize} />
      <WeatherStat icon={Wind} value={current.windSpeed} visible={config.showWind} fontSize={fontSize} />
      <WeatherStat icon={Gauge} value={pressure?.value} unit={pressure ? ` ${pressure.unit}` : undefined} visible={config.showPressure} fontSize={fontSize} />
      <WeatherStat icon={Eye} value={current.visibility} unit={units === 'metric' ? ' km' : ' mi'} visible={config.showVisibility} fontSize={fontSize} />
      <WeatherStat icon={Thermometer} value={current.dewPoint} unit="°" visible={config.showDewPoint} fontSize={fontSize} />
      <WeatherStat icon={Sun} value={current.uvIndex != null ? `UV ${Math.round(current.uvIndex)}` : null} visible={config.showUV} fontSize={fontSize} testId="weather-stat-uv" />
      {/* One chip, not two: a row that wraps keeps sunrise and sunset
          together instead of leaving the sunset alone on the next line. */}
      {config.showSunTimes && sun.sunrise && sun.sunset && (
        <span className="flex items-center gap-0.5 whitespace-nowrap" style={{ fontSize, opacity: TEXT_OPACITY.dim }} data-testid="weather-stat-sun-times">
          <Sunrise size="1em" aria-hidden="true" /><span data-testid="weather-stat-sunrise">{formatTimeInTZ(sun.sunrise, clock)}</span>
          <span aria-hidden="true" className="mx-0.5">–</span>
          <Sunset size="1em" aria-hidden="true" /><span data-testid="weather-stat-sunset">{formatTimeInTZ(sun.sunset, clock)}</span>
        </span>
      )}
    </>
  );
}
