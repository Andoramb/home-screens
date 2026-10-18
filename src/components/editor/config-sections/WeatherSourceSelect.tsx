'use client';

import { useMemo } from 'react';
import LabeledField from '@/components/ui/LabeledField';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';
import type { WeatherProviderOption } from '@/types/config';
import { WEATHER_PROVIDERS } from '@/components/editor/settings/weather/providers';

/** Providers that cannot run without an API key, from the one provider table. */
export const KEYED_PROVIDER_IDS: ReadonlySet<string> = new Set(
  WEATHER_PROVIDERS.filter((p) => p.secretKey !== null).map((p) => p.id),
);

/**
 * The sources a module may pick: every keyless one, plus each keyed one
 * whose key is saved. Empty until a good key status has landed, so a picker
 * is never rendered without the saved provider among its options (a change
 * event on such a picker would overwrite the real value).
 */
export function useConfiguredWeatherProviders(): { providers: string[]; known: boolean } {
  const { status: secrets, loading, error, hasStatus } = useSecretStatus();
  const providers = useMemo<string[]>(() => {
    // A failed refetch after a good status keeps using that last snapshot.
    if (loading || (error && !hasStatus)) return [];
    const out: string[] = [];
    if (secrets.openweathermap_key) out.push('openweathermap');
    if (secrets.weatherapi_key) out.push('weatherapi');
    if (secrets.pirateweather_key) out.push('pirateweather');
    if (secrets.metoffice_key) out.push('metoffice');
    // The rest need no API key and are always available.
    out.push('noaa', 'open-meteo', 'yr', 'smhi', 'envcanada');
    return out;
  }, [secrets, loading, error, hasStatus]);
  return { providers, known: hasStatus && !loading };
}

const OPTION_KEYS: Record<string, string> = {
  openweathermap: 'openweathermap',
  weatherapi: 'weatherapi',
  pirateweather: 'pirateweather',
  noaa: 'noaa',
  'open-meteo': 'openMeteo',
  yr: 'yr',
  smhi: 'smhi',
  metoffice: 'metoffice',
  envcanada: 'envcanada',
};

/** The fixed order the picker lists sources in, keyed ones first. */
const OPTION_ORDER = ['openweathermap', 'weatherapi', 'pirateweather', 'noaa', 'open-meteo', 'yr', 'smhi', 'metoffice', 'envcanada'];

interface Props {
  value: WeatherProviderOption;
  onChange: (provider: WeatherProviderOption) => void;
  /** The sources to offer, already narrowed to what the current view can use. */
  providers: string[];
  /** Whether "Same as Settings" is an option; a view needing a capability only some sources have drops it. */
  allowGlobal?: boolean;
}

/**
 * The per-module weather source picker, shared by the Weather and
 * Full-Screen Weather sections so both modules read the same control.
 */
export function WeatherSourceSelect({ value, onChange, providers, allowGlobal = true }: Props) {
  const t = useTranslate('editor');
  if (providers.length === 0) return null;
  return (
    <LabeledField label={t('configSections.weather.dataProvider')}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as WeatherProviderOption)}
        className={INPUT_CLASS}
        data-testid="weather-source-select"
      >
        {allowGlobal && <option value="global">{t('configSections.weather.providers.global')}</option>}
        {OPTION_ORDER.filter((p) => providers.includes(p)).map((p) => (
          <option key={p} value={p}>{t(`configSections.weather.providers.${OPTION_KEYS[p]}`)}</option>
        ))}
      </select>
    </LabeledField>
  );
}
