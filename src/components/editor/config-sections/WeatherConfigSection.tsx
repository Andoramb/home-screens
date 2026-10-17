'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import Toggle from '@/components/ui/Toggle';
import LabeledField from '@/components/ui/LabeledField';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useEditorStore } from '@/stores/editor-store';
import { getLocation } from '@/lib/location';
import { formatCoords } from '@/components/modules/weather/location-label';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, WeatherConfig, WeatherView, WeatherIconSet, WeatherProviderOption } from '@/types/config';
import { settingsPath } from '@/lib/settings-route';
import { WEATHER_PROVIDERS } from '@/components/editor/settings/weather/providers';

/** Providers that cannot run without an API key, from the one provider table. */
const KEYED_PROVIDER_IDS: ReadonlySet<string> = new Set(
  WEATHER_PROVIDERS.filter((p) => p.secretKey !== null).map((p) => p.id),
);

/**
 * What a provider's payload can carry, so the editor offers a toggle or a
 * view only where the wall could show something. Each flag is read off the
 * provider file in `src/lib/weather/`: a flag set here for a field the
 * provider never emits is a control that does nothing.
 */
export interface WeatherProviderCaps {
  minutely?: boolean;
  alerts?: boolean;
  feelsLike?: boolean;
  /** Daily precipitation total on the forecast days. */
  precipAmount?: boolean;
  windDirection?: boolean;
  gust?: boolean;
  pressure?: boolean;
  visibility?: boolean;
  dewPoint?: boolean;
  uv?: boolean;
}

export const PROVIDER_CAPS: Record<string, WeatherProviderCaps> = {
  openweathermap: { feelsLike: true, precipAmount: true, windDirection: true, gust: true, pressure: true },
  weatherapi: { feelsLike: true, precipAmount: true, windDirection: true, gust: true, uv: true },
  pirateweather: { minutely: true, alerts: true, feelsLike: true, precipAmount: true, windDirection: true, gust: true, uv: true, pressure: true, visibility: true, dewPoint: true },
  // NOAA's hourly feed names the direction as compass text and gives no gust.
  // Feels-like, pressure and visibility all come from the same station
  // observation and only land on the current hour; feels-like further
  // depends on the station reporting a wind chill or heat index.
  noaa: { alerts: true, feelsLike: true, windDirection: true, pressure: true, visibility: true, dewPoint: true },
  'open-meteo': { feelsLike: true, precipAmount: true, windDirection: true, gust: true, pressure: true, dewPoint: true, uv: true },
  yr: { precipAmount: true, windDirection: true, gust: true, pressure: true },
  smhi: { precipAmount: true, windDirection: true, gust: true, pressure: true },
  // Met Office was missing entirely, so the editor reported it as having no
  // optional fields even though the provider emits all of these.
  metoffice: { feelsLike: true, precipAmount: true, windDirection: true, gust: true, pressure: true, visibility: true, dewPoint: true, uv: true },
  // ECCC's hourly blocks carry a compass direction and a km/h gust, but no
  // feels-like and no precipitation amount anywhere in the citypage feed.
  envcanada: { windDirection: true, gust: true },
};

// Which provider capability a view requires (omit = available for all providers)
const VIEW_REQUIRES: Partial<Record<WeatherView, 'minutely' | 'alerts'>> = {
  precipitation: 'minutely',
  alerts: 'alerts',
};

/**
 * The settings each view reads, so the panel offers a toggle only where it
 * changes the wall. Built from what the view components read: a toggle shown
 * for a view that ignores it (Dew Point on Week ahead, Humidity on the written
 * forecast) is a control that does nothing.
 */
type Field =
  | 'icons' | 'hours' | 'days' | 'featuredDay' | 'relativeDays' | 'feelsLike' | 'highLow'
  | 'precipitation' | 'precipAmount' | 'humidity' | 'wind' | 'pressure' | 'visibility' | 'dewPoint'
  | 'uv' | 'sunTimes';
const STATION: readonly Field[] = ['precipitation', 'humidity', 'wind', 'pressure', 'visibility', 'dewPoint'];
const VIEW_FIELDS: Record<WeatherView, readonly Field[]> = {
  current: ['icons', 'feelsLike', ...STATION, 'uv', 'sunTimes'],
  hourly: ['icons', 'hours', 'feelsLike', 'precipitation', 'humidity', 'wind'],
  daily: ['icons', 'days', 'featuredDay', 'relativeDays', 'highLow', 'precipitation', 'precipAmount', 'humidity', 'wind'],
  combined: ['icons', 'hours', 'days', 'feelsLike', 'highLow', ...STATION],
  compact: ['icons', 'feelsLike', 'highLow', ...STATION, 'uv', 'sunTimes'],
  table: ['icons', 'days', 'highLow', 'precipitation', 'precipAmount', 'humidity', 'wind'],
  precipitation: [],
  alerts: [],
  ribbon: ['hours'],
  week: ['icons', 'days', 'relativeDays', 'highLow', 'precipitation', 'humidity', 'wind'],
  timeline: ['icons', 'hours'],
  stats: [],
  sun: [],
  narrative: ['icons', 'days', 'relativeDays', 'highLow'],
};

/** Sources give up to a day and a half ahead; past this the field asks for hours no source has. */
const MAX_HOURS = 36;

export function WeatherConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');

  const ICON_SETS: { value: WeatherIconSet; label: string }[] = [
    { value: 'outline', label: t('configSections.weather.iconSets.outline') },
    { value: 'color', label: t('configSections.weather.iconSets.color') },
  ];

  const ALL_WEATHER_VIEWS: { value: WeatherView; label: string }[] = [
    { value: 'current', label: t('configSections.weather.views.current') },
    { value: 'hourly', label: t('configSections.weather.views.hourly') },
    { value: 'daily', label: t('configSections.weather.views.daily') },
    { value: 'combined', label: t('configSections.weather.views.combined') },
    { value: 'compact', label: t('configSections.weather.views.compact') },
    { value: 'table', label: t('configSections.weather.views.table') },
    { value: 'precipitation', label: t('configSections.weather.views.precipitation') },
    { value: 'alerts', label: t('configSections.weather.views.alerts') },
    // The Full-Screen Weather module's pieces, one option each.
    { value: 'ribbon', label: t('configSections.weather.views.ribbon') },
    { value: 'week', label: t('configSections.weather.views.week') },
    { value: 'timeline', label: t('configSections.weather.views.timeline') },
    { value: 'stats', label: t('configSections.weather.views.stats') },
    { value: 'sun', label: t('configSections.weather.views.sun') },
    { value: 'narrative', label: t('configSections.weather.views.narrative') },
  ];
  const { config: c, set } = useModuleConfig<Partial<WeatherConfig>>(mod, screenId);

  const globalProvider = useEditorStore((s) => s.config?.settings?.weather?.provider);
  const settings = useEditorStore((s) => s.config?.settings);

  // What the module renders when the custom label is left empty — shown as the
  // input's placeholder so the box previews its own fallback.
  const location = getLocation(settings);
  const automaticLabel = settings?.locationName?.trim()
    || (location ? formatCoords(location.lat, location.lon) : '');

  const { status: secrets, loading: secretsLoading, error: secretsError, hasStatus } = useSecretStatus();
  const configuredProviders = useMemo<string[]>(() => {
    // Until a good status has landed, return [] and keep the picker hidden:
    // rendering the select without the saved keyed provider in its options
    // would misreport it and let a change event overwrite the real value.
    // A failed refetch after a good status keeps using that last snapshot.
    if (secretsLoading || (secretsError && !hasStatus)) return [];
    const providers: string[] = [];
    if (secrets.openweathermap_key) providers.push('openweathermap');
    if (secrets.weatherapi_key) providers.push('weatherapi');
    if (secrets.pirateweather_key) providers.push('pirateweather');
    if (secrets.metoffice_key) providers.push('metoffice');
    // The rest need no API key and are always available.
    providers.push('noaa', 'open-meteo', 'yr', 'smhi', 'envcanada');
    return providers;
  }, [secrets, secretsLoading, secretsError, hasStatus]);

  const effectiveProvider = (c.provider && c.provider !== 'global') ? c.provider : (globalProvider ?? 'open-meteo');
  const caps = PROVIDER_CAPS[effectiveProvider] ?? {};
  // A keyed provider with no key renders nothing but "No weather data" on the
  // wall, and nothing in the editor says why. Surface it here, next to the
  // module, with a link to where the key goes. Only judged once a real
  // secret status has landed, so a slow first fetch never flashes a warning.
  const apiKeyMissing = hasStatus && !secretsLoading
    && KEYED_PROVIDER_IDS.has(effectiveProvider)
    && !configuredProviders.includes(effectiveProvider);

  const availableViews = ALL_WEATHER_VIEWS.filter((v) => {
    const req = VIEW_REQUIRES[v.value];
    return !req || caps[req];
  });

  const view = c.view ?? 'hourly';

  // Auto-reset view if the current provider doesn't support it
  const viewReq = VIEW_REQUIRES[view];
  const viewIncompatible = !!(viewReq && !caps[viewReq]);
  useEffect(() => {
    if (viewIncompatible) set({ view: 'hourly' });
  }, [viewIncompatible, set]);

  const viewRequirement = VIEW_REQUIRES[view];
  const filteredProviders = viewRequirement
    ? configuredProviders.filter((p) => PROVIDER_CAPS[p]?.[viewRequirement])
    : configuredProviders;

  const has = (field: Field) => VIEW_FIELDS[view].includes(field);
  // Icon style applies wherever a condition icon is drawn.
  const showsIcons = has('icons');

  return (
    <>
      {apiKeyMissing && (
        <div className="rounded-md border border-hs-warning/30 bg-hs-warning/10 px-3 py-2 text-xs" data-testid="weather-api-key-row">
          <p className="text-hs-text-body">{t('configSections.weather.apiKeyMissing')}</p>
          <Link
            href={settingsPath({ kind: 'defaults', page: 'weather' })}
            className="mt-1 inline-block font-medium text-hs-accent hover:underline"
          >
            {t('configSections.weather.addApiKey')}
          </Link>
        </div>
      )}
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={availableViews}
      />
      {/* Outside the showsStats guard on purpose: the alerts and precipitation
          views want the place name most ("which area is this alert for?"). */}
      <Toggle
        label={t('configSections.weather.showLocation')}
        checked={!!c.showLocation}
        onChange={(v) => set({ showLocation: v })}
      />
      {c.showLocation && (
        <LabeledInput
          label={t('configSections.weather.locationLabel')}
          value={c.locationLabel ?? ''}
          onChange={(v) => set({ locationLabel: v })}
          placeholder={automaticLabel}
        />
      )}
      {view === 'alerts' && caps.alerts && (
        <Toggle label={t('configSections.weather.hideWhenNoAlerts')} checked={!!c.hideWhenNoAlerts} onChange={(v) => set({ hideWhenNoAlerts: v })} />
      )}
      {showsIcons && (
        <LabeledSelect
          label={t('configSections.weather.iconStyle')}
          value={c.iconSet ?? 'color'}
          onChange={(v) => set({ iconSet: v })}
          options={ICON_SETS}
        />
      )}
      {filteredProviders.length > 0 && (
        <LabeledField label={t('configSections.weather.dataProvider')}>
          <select
            value={c.provider ?? 'global'}
            onChange={(e) => set({ provider: e.target.value as WeatherProviderOption })}
            className={INPUT_CLASS}
          >
            {!viewRequirement && <option value="global">{t('configSections.weather.providers.global')}</option>}
            {filteredProviders.includes('openweathermap') && (
              <option value="openweathermap">{t('configSections.weather.providers.openweathermap')}</option>
            )}
            {filteredProviders.includes('weatherapi') && (
              <option value="weatherapi">{t('configSections.weather.providers.weatherapi')}</option>
            )}
            {filteredProviders.includes('pirateweather') && (
              <option value="pirateweather">{t('configSections.weather.providers.pirateweather')}</option>
            )}
            {filteredProviders.includes('noaa') && (
              <option value="noaa">{t('configSections.weather.providers.noaa')}</option>
            )}
            {filteredProviders.includes('open-meteo') && (
              <option value="open-meteo">{t('configSections.weather.providers.openMeteo')}</option>
            )}
            {filteredProviders.includes('yr') && (
              <option value="yr">{t('configSections.weather.providers.yr')}</option>
            )}
            {filteredProviders.includes('smhi') && (
              <option value="smhi">{t('configSections.weather.providers.smhi')}</option>
            )}
            {filteredProviders.includes('metoffice') && (
              <option value="metoffice">{t('configSections.weather.providers.metoffice')}</option>
            )}
            {filteredProviders.includes('envcanada') && (
              <option value="envcanada">{t('configSections.weather.providers.envcanada')}</option>
            )}
          </select>
        </LabeledField>
      )}
      {has('hours') && (
        <>
          <LabeledInput
            label={t('configSections.weather.hoursToShow')}
            type="number"
            min={2}
            max={MAX_HOURS}
            value={c.hoursToShow ?? 8}
            onChange={(v) => set({ hoursToShow: Math.min(MAX_HOURS, Number(v)) })}
          />
          <span className="text-xs text-hs-text-muted">{t('configSections.weather.hoursToShowHint')}</span>
        </>
      )}
      {has('days') && (
        <LabeledInput
          label={t('configSections.weather.daysToShow')}
          type="number"
          value={c.daysToShow ?? 5}
          onChange={(v) => set({ daysToShow: Number(v) })}
        />
      )}
      {has('featuredDay') && (
        <Toggle label={t('configSections.weather.showFeaturedDay')} checked={c.showFeaturedDay !== false} onChange={(v) => set({ showFeaturedDay: v })} />
      )}
      {has('relativeDays') && (
        <Toggle label={t('configSections.weather.showRelativeDayLabels')} checked={c.showRelativeDayLabels !== false} onChange={(v) => set({ showRelativeDayLabels: v })} />
      )}
      {has('feelsLike') && (
        <Toggle label={t('configSections.weather.feelsLike')} checked={c.showFeelsLike !== false} onChange={(v) => set({ showFeelsLike: v })} />
      )}
      {has('highLow') && (
        <Toggle label={t('configSections.weather.highLow')} checked={c.showHighLow !== false} onChange={(v) => set({ showHighLow: v })} />
      )}
      {has('precipitation') && (
        <Toggle label={t('configSections.weather.precipitation')} checked={c.showPrecipitation !== false} onChange={(v) => set({ showPrecipitation: v })} />
      )}
      {has('precipAmount') && (
        <Toggle label={t('configSections.weather.precipitationAmount')} checked={!!c.showPrecipAmount} onChange={(v) => set({ showPrecipAmount: v })} />
      )}
      {has('humidity') && (
        <Toggle label={t('configSections.weather.humidity')} checked={!!c.showHumidity} onChange={(v) => set({ showHumidity: v })} />
      )}
      {has('wind') && (
        <Toggle label={t('configSections.weather.windSpeed')} checked={!!c.showWind} onChange={(v) => set({ showWind: v })} />
      )}
      {has('pressure') && caps.pressure && (
        <Toggle label={t('configSections.weather.pressure')} checked={!!c.showPressure} onChange={(v) => set({ showPressure: v })} />
      )}
      {has('visibility') && caps.visibility && (
        <Toggle label={t('configSections.weather.visibility')} checked={!!c.showVisibility} onChange={(v) => set({ showVisibility: v })} />
      )}
      {has('dewPoint') && caps.dewPoint && (
        <Toggle label={t('configSections.weather.dewPoint')} checked={!!c.showDewPoint} onChange={(v) => set({ showDewPoint: v })} />
      )}
      {has('uv') && caps.uv && (
        <Toggle label={t('configSections.weather.uvIndex')} checked={!!c.showUV} onChange={(v) => set({ showUV: v })} />
      )}
      {has('sunTimes') && (
        <Toggle label={t('configSections.weather.sunTimes')} checked={!!c.showSunTimes} onChange={(v) => set({ showSunTimes: v })} />
      )}
    </>
  );
}
