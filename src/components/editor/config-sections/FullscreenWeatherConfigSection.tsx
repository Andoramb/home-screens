'use client';

import Toggle from '@/components/ui/Toggle';
import ColorPicker from '@/components/ui/ColorPicker';
import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledInput from '@/components/ui/LabeledInput';
import FullscreenThemeSelect from './FullscreenThemeSelect';
import { useTypographySizeOptions } from './useTypographySizeOptions';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, FullscreenWeatherConfig } from '@/types/config';
import { clampDaysToShow } from '@/components/modules/fullscreen-weather/weather-view-utils';

type Config = Partial<FullscreenWeatherConfig>;

export function FullscreenWeatherConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<Config>(mod, screenId);
  const typographySizeOptions = useTypographySizeOptions();
  const view = c.view ?? 'panorama';

  const VIEWS = [
    { value: 'panorama', label: t('configSections.fullscreen-weather.viewPanorama') },
    { value: 'strip', label: t('configSections.fullscreen-weather.viewStrip') },
    { value: 'almanac', label: t('configSections.fullscreen-weather.viewAlmanac') },
    { value: 'ambient', label: t('configSections.fullscreen-weather.viewAmbient') },
    { value: 'week', label: t('configSections.fullscreen-weather.viewWeek') },
    { value: 'hourly', label: t('configSections.fullscreen-weather.viewHourly') },
    { value: 'forecast', label: t('configSections.fullscreen-weather.viewForecast') },
    { value: 'conditions', label: t('configSections.fullscreen-weather.viewConditions') },
  ] as const;
  const cardView = view === 'forecast' || view === 'conditions';

  const DENSITY_OPTIONS = [
    { value: 'cozy', label: t('configSections.fullscreen-weather.densityCozy') },
    { value: 'snug', label: t('configSections.fullscreen-weather.densitySnug') },
  ] as const;

  const SKY_OPTIONS = [
    { value: 'living', label: t('configSections.fullscreen-weather.skyLiving') },
    { value: 'still', label: t('configSections.fullscreen-weather.skyStill') },
    { value: 'off', label: t('configSections.fullscreen-weather.skyOff') },
  ] as const;

  const MAP_STYLE_OPTIONS = [
    { value: 'light', label: t('configSections.fullscreen-weather.mapStyleLight') },
    { value: 'standard', label: t('configSections.fullscreen-weather.mapStyleStandard') },
    { value: 'dark', label: t('configSections.fullscreen-weather.mapStyleDark') },
  ] as const;

  // The cards, in the order the Conditions page draws them (air quality is
  // its banner). What is on is what shows; the hint below says how.
  const CARD_TOGGLES = [
    ['showAirQuality', 'cardAirQuality'],
    ['showMoon', 'cardMoon'],
    ['showUV', 'cardUV'],
    ['showFeelsLike', 'cardFeelsLike'],
    ['showPrecipitation', 'cardPrecipitation'],
    ['showVisibility', 'cardVisibility'],
    ['showHumidity', 'cardHumidity'],
    ['showPressure', 'cardPressure'],
    ['showNowcast', 'cardNowcast'],
    ['showWind', 'cardWind'],
    ['showSun', 'cardSun'],
  ] as const satisfies ReadonlyArray<readonly [keyof Config, string]>;

  return (
    <>
      {/* The living sky paints its own colours over the theme (white text,
          translucent cards), so the theme picker only shows when a theme
          would be seen: Still and Off. */}
      {(c.skyLayer ?? 'living') !== 'living' && (
        <FullscreenThemeSelect
          value={c.theme}
          onChange={(theme) => set({ theme })}
          defaultOptionKey="configSections.fullscreen-weather.themeDefault"
        />
      )}

      <LabeledSelect
        label={t('configSections.fullscreen-weather.view')}
        value={view}
        onChange={(v) => set({ view: v })}
        options={VIEWS}
      />

      <LabeledSelect
        label={t('common.density')}
        value={c.density ?? 'snug'}
        onChange={(v) => set({ density: v })}
        options={DENSITY_OPTIONS}
      />

      <LabeledSelect
        label={t('configSections.fullscreen-weather.typographySize')}
        value={c.typographySize ?? 'medium'}
        onChange={(v) => set({ typographySize: v })}
        options={typographySizeOptions}
      />

      {/* Sky */}
      <LabeledSelect
        label={t('configSections.fullscreen-weather.skyLayer')}
        value={c.skyLayer ?? 'living'}
        onChange={(v) => set({ skyLayer: v })}
        options={SKY_OPTIONS}
      />
      <p className="text-[11px] text-hs-text-faint leading-relaxed">
        {t('configSections.fullscreen-weather.skyLayerHint')}
      </p>

      <Toggle
        label={t('configSections.fullscreen-weather.showTime')}
        checked={c.showTime !== false}
        onChange={(v) => set({ showTime: v })}
      />

      <Toggle
        label={t('configSections.fullscreen-weather.showAlerts')}
        checked={c.showAlerts !== false}
        onChange={(v) => set({ showAlerts: v })}
      />

      {/* Wide strip is Panorama's parts side by side and reads the same three flags. */}
      {(view === 'panorama' || view === 'strip') && (
        <>
          <Toggle
            label={t('configSections.fullscreen-weather.showRibbon')}
            checked={c.showRibbon !== false}
            onChange={(v) => set({ showRibbon: v })}
          />
          <Toggle
            label={t('configSections.fullscreen-weather.showStatRail')}
            checked={c.showStatRail !== false}
            onChange={(v) => set({ showStatRail: v })}
          />
          <Toggle
            label={t('configSections.fullscreen-weather.showNowcast')}
            checked={c.showNowcast !== false}
            onChange={(v) => set({ showNowcast: v })}
          />
          {/* Only Pirate Weather returns minute-by-minute data today, so the
              strip stays hidden on every other source. Say so here rather than
              rendering an empty panel on the wall. */}
          <p className="text-[11px] text-hs-text-faint leading-relaxed">
            {t('configSections.fullscreen-weather.showNowcastHint')}
          </p>
        </>
      )}

      {cardView && (
        <>
          {view === 'forecast' && (
            <Toggle
              label={t('configSections.fullscreen-weather.showMap')}
              checked={c.showMap !== false}
              onChange={(v) => set({ showMap: v })}
            />
          )}
          {c.showMap !== false && view === 'forecast' && (
            <>
              <LabeledInput
                label={t('configSections.fullscreen-weather.mapZoom')}
                type="number"
                value={c.mapZoom ?? 6}
                onChange={(v) => set({ mapZoom: Math.max(1, Math.min(12, Number(v) || 6)) })}
              />
              <LabeledSelect
                label={t('configSections.fullscreen-weather.mapStyle')}
                value={c.mapStyle ?? 'light'}
                onChange={(v) => set({ mapStyle: v })}
                options={MAP_STYLE_OPTIONS}
              />
              <Toggle
                label={t('configSections.fullscreen-weather.mapAnimate')}
                checked={c.mapAnimate !== false}
                onChange={(v) => set({ mapAnimate: v })}
              />
            </>
          )}
          <p className="text-[11px] text-hs-text-faint leading-relaxed">
            {t('configSections.fullscreen-weather.cardsHint')}
          </p>
          {CARD_TOGGLES.map(([key, labelKey]) => (
            <Toggle
              key={key}
              label={t(`configSections.fullscreen-weather.${labelKey}`)}
              checked={c[key] !== false}
              onChange={(v) => set({ [key]: v })}
            />
          ))}
        </>
      )}

      {(view === 'panorama' || view === 'strip' || view === 'week' || view === 'forecast') && (
        <LabeledInput
          label={t('configSections.fullscreen-weather.daysToShow')}
          type="number"
          value={c.daysToShow ?? 7}
          onChange={(v) => set({ daysToShow: clampDaysToShow(Number(v) || undefined) })}
        />
      )}

      <LabeledInput
        label={t('configSections.fullscreen-weather.locationLabel')}
        value={c.locationLabel ?? ''}
        onChange={(v) => set({ locationLabel: v })}
      />

      {/* An empty accentColor means "follow the weather": amber for clear,
          blue for rain, violet for storms. The picker can only ever write a
          colour, so the way back to empty has to be its own control. The
          Forecast and Conditions pages draw nothing with the accent, so they
          do not offer it. */}
      {!cardView && (
        <>
          <Toggle
            label={t('configSections.fullscreen-weather.accentAuto')}
            checked={!c.accentColor}
            onChange={(auto) => set({ accentColor: auto ? '' : '#f59e0b' })}
          />
          {c.accentColor ? (
            <ColorPicker
              label={t('configSections.fullscreen-weather.accentColor')}
              value={c.accentColor}
              onChange={(v) => set({ accentColor: v })}
            />
          ) : null}
        </>
      )}
    </>
  );
}
