import { expect, type Locator } from '@playwright/test';
import type { ConfigVariant } from './types';

/**
 * fullscreen-weather rows.
 *
 * All rows use the shared `weather` stub (72° current, a multi-day forecast),
 * so assertions key off that payload. Each row flips exactly one field and
 * proves the render changed, per the CONFIG_VARIANTS contract.
 */
/** A 7-day forecast so `daysToShow` has something to trim (the shared weather
 *  stub ships only 2 days, which would make every setting render identically). */
const SEVEN_DAY_BODY = {
  hourly: [
    { time: '2099-07-07T12:00:00Z', temp: 72, feelsLike: 70, humidity: 55, icon: 'sun', description: 'Clear', windSpeed: 8, precipProbability: 0 },
    { time: '2099-07-07T13:00:00Z', temp: 74, feelsLike: 72, humidity: 53, icon: 'sun', description: 'Clear', windSpeed: 9, precipProbability: 0 },
    { time: '2099-07-07T14:00:00Z', temp: 76, feelsLike: 75, humidity: 50, icon: 'sun', description: 'Clear', windSpeed: 9, precipProbability: 10 },
  ],
  forecast: Array.from({ length: 7 }, (_, i) => ({
    date: `2099-07-${String(7 + i).padStart(2, '0')}`,
    high: 78 + i, low: 61 + i, icon: 'sun', description: 'Sunny', precipProbability: 0,
  })),
};

/** The shared rain-map fixture, as the map card's second feed. */
const RAIN_MAP_BODY = {
  version: '2.0', generated: 4081276800, host: 'https://api.librewxr.net',
  radar: {
    past: [{ time: 4081276200, path: '/v2/radar/4081276200' }, { time: 4081276800, path: '/v2/radar/4081276800' }],
    nowcast: [{ time: 4081277400, path: '/v2/radar/nowcast_4081277400' }],
  },
  satellite: { infrared: [] },
};

export const FULLSCREEN_WEATHER_VARIANTS: ConfigVariant[] = [
  {
    // theme is the shared fullscreen token set; midnight paints bg #0a0a0a.
    type: 'fullscreen-weather', name: 'theme-midnight', kind: 'networked', stubKey: 'weather',
    config: { theme: 'midnight' },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fullscreen-weather"]')).toHaveAttribute('style', /#0a0a0a/i);
    },
  },
  {
    // skyLayer 'off' removes the sky element entirely.
    type: 'fullscreen-weather', name: 'sky-off', kind: 'networked', stubKey: 'weather',
    config: { skyLayer: 'off' },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-sky"]')).toHaveCount(0);
    },
  },
  {
    // 'still' is the flat wash: one sky element with no animated layers in it.
    type: 'fullscreen-weather', name: 'sky-still', kind: 'networked', stubKey: 'weather',
    config: { skyLayer: 'still' },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-sky"]')).toHaveAttribute('data-scene', 'still');
      await expect(mod.locator('[data-testid="fsw-sky"] [style*="fsw-sky-"]')).toHaveCount(0);
    },
  },
  {
    // 'living' mounts the animated stack: the sky names its scene and carries
    // the keyframes its layers run on.
    type: 'fullscreen-weather', name: 'sky-living', kind: 'networked', stubKey: 'weather',
    config: { skyLayer: 'living' },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-sky"]')).toHaveAttribute('data-scene', /^(clear|partly|golden|overcast|fog|rain|storm|snow)/);
      // Every scene has at least one layer running a sky keyframe (clouds,
      // stars, rain); the still wash has none.
      await expect(mod.locator('[data-testid="fsw-sky"] [style*="fsw-sky-"]').first()).toBeAttached();
    },
  },
  {
    // daysToShow trims the range-bar list; 3 rows instead of the default 7.
    // The header names the number of days actually drawn, so a 7-day body
    // trimmed to 3 proves the field rather than echoing the config back.
    type: 'fullscreen-weather', name: 'days-to-show-3', kind: 'networked', stubKey: 'weather',
    stubBody: SEVEN_DAY_BODY,
    config: { view: 'panorama', daysToShow: 3 },
    expect: async (mod) => { await expect(mod).toContainText('3-day outlook'); },
  },
  {
    // The same field trims the Week view, which counts a `fsw-week-day` per day.
    type: 'fullscreen-weather', name: 'days-to-show-week-3', kind: 'networked', stubKey: 'weather',
    stubBody: SEVEN_DAY_BODY,
    config: { view: 'week', daysToShow: 3 },
    expect: async (mod) => { await expect(mod.locator('[data-testid="fsw-week-day"]')).toHaveCount(3); },
  },
  {
    // showRibbon hides the 48h temperature curve (the only <svg> in Panorama
    // once the stat rail is off, so assert on the section label instead).
    type: 'fullscreen-weather', name: 'hide-ribbon', kind: 'networked', stubKey: 'weather',
    config: { view: 'panorama', showRibbon: false },
    expect: async (mod) => {
      await expect(mod).toBeVisible();
      await expect(mod).not.toContainText('Chance of rain');
    },
  },
  {
    type: 'fullscreen-weather', name: 'hide-stat-rail', kind: 'networked', stubKey: 'weather',
    config: { view: 'panorama', showStatRail: false },
    expect: async (mod) => {
      await expect(mod).toBeVisible();
      await expect(mod).not.toContainText('UV Index');
    },
  },
  {
    // The weather stub carries no minutely payload, so the strip is absent
    // regardless — this row pins that the toggle never crashes the view.
    type: 'fullscreen-weather', name: 'hide-nowcast', kind: 'networked', stubKey: 'weather',
    config: { view: 'panorama', showNowcast: false },
    expect: async (mod) => {
      await expect(mod).toBeVisible();
      await expect(mod).not.toContainText('Next hour');
    },
  },
  {
    // The stub has no alerts, so showAlerts true still renders no band; the
    // row proves the flag is wired and the view survives either setting.
    type: 'fullscreen-weather', name: 'hide-alerts', kind: 'networked', stubKey: 'weather',
    config: { showAlerts: false },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-alert"]')).toHaveCount(0);
    },
  },
  {
    // showTime gates the header clock in every view.
    type: 'fullscreen-weather', name: 'hide-time', kind: 'networked', stubKey: 'weather',
    config: { showTime: false },
    expect: async (mod) => { await expect(mod.locator('[data-testid="fsw-clock"]')).toHaveCount(0); },
  },
  {
    type: 'fullscreen-weather', name: 'show-time', kind: 'networked', stubKey: 'weather',
    config: { showTime: true },
    expect: async (mod) => { await expect(mod.locator('[data-testid="fsw-clock"]')).toHaveCount(1); },
  },
  {
    type: 'fullscreen-weather', name: 'location-label', kind: 'networked', stubKey: 'weather',
    config: { locationLabel: 'E2E Weather Town' },
    expect: async (mod) => { await expect(mod).toContainText('E2E Weather Town'); },
  },
  {
    // accentColor overrides the condition-derived accent on the hero halo.
    type: 'fullscreen-weather', name: 'accent-color', kind: 'networked', stubKey: 'weather',
    config: { accentColor: '#ff00aa' },
    expect: async (mod) => {
      await expect(mod.locator('[style*="rgb(255, 0, 170)"], [style*="#ff00aa"]').first()).toBeAttached();
    },
  },
  {
    type: 'fullscreen-weather', name: 'typography-2x-large', kind: 'networked', stubKey: 'weather',
    config: { typographySize: '2x-large' },
    expect: async (mod) => { await expect(mod).toContainText('72°'); },
  },
  {
    type: 'fullscreen-weather', name: 'density-cozy', kind: 'networked', stubKey: 'weather',
    config: { density: 'cozy' },
    expect: async (mod) => { await expect(mod).toContainText('72°'); },
  },
];

/**
 * A payload that fills every Forecast and Conditions card: wind direction and gusts, UV,
 * visibility, pressure, dew point, daily amounts and a minutely strip. Each
 * card row below turns one card off and proves it left; the default render
 * of the same payload is what proves the card was there.
 */
const FORECAST_BODY = {
  hourly: Array.from({ length: 12 }, (_, i) => ({
    time: `2099-07-07T${String(12 + i).padStart(2, '0')}:00:00Z`,
    temp: 72 + i, feelsLike: 70 + i, humidity: 55, dewPoint: 54, icon: 'sun', description: 'Clear',
    windSpeed: 8, windDirection: 270, windGust: 14, precipProbability: 0, pressure: 1017 + i, visibility: 10, uvIndex: 3,
  })),
  forecast: Array.from({ length: 7 }, (_, i) => ({
    date: `2099-07-${String(7 + i).padStart(2, '0')}`,
    high: 78 + i, low: 61 + i, icon: 'sun', description: 'Sunny', precipProbability: i === 2 ? 55 : 0, precipAmount: i === 2 ? 0.1 : 0,
  })),
  minutely: Array.from({ length: 60 }, (_, m) => ({ time: 4081276800 + m * 60, intensity: 0, probability: 0 })),
};

/** One row per card toggle: the card is there by default and gone when off. */
function cardRow(name: string, field: string, testId: string, view: 'forecast' | 'conditions' = 'conditions'): ConfigVariant {
  return {
    type: 'fullscreen-weather', name, kind: 'networked', stubKey: 'weather', stubBody: FORECAST_BODY,
    extraStubs: { 'air-quality': { aqi: 2, pm25: 8.4, pm10: 12.1, o3: 48.2, no2: 15.6 } },
    // The Forecast view's map card asks the OpenStreetMap tile server, which the
    // external block answers; the Conditions view has no map.
    allowsExternal: view === 'forecast',
    config: { view, [field]: false },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-hero"]')).toBeVisible();
      await expect(mod.locator(`[data-testid="${testId}"]`)).toHaveCount(0);
    },
  };
}

/** The Conditions page's card order (ConditionsView.tsx): air quality on top, then these, every one that is on. */
const CONDITIONS_ORDER = ['moon', 'uv', 'feelsLike', 'precipitation', 'visibility', 'humidity', 'pressure', 'nowcast', 'wind', 'sun'] as const;
const CARD_TOGGLE: Record<(typeof CONDITIONS_ORDER)[number], string> = {
  moon: 'showMoon', uv: 'showUV', feelsLike: 'showFeelsLike', humidity: 'showHumidity', precipitation: 'showPrecipitation',
  pressure: 'showPressure', visibility: 'showVisibility', nowcast: 'showNowcast', wind: 'showWind', sun: 'showSun',
};

/** The card keys on the page, top to bottom, left to right. */
async function drawnCards(mod: Locator): Promise<string[]> {
  return mod.locator('[data-testid^="fsw-card-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.slice('fsw-card-'.length)));
}

/** Turning one Conditions card off: it goes, every other card stays, the order holds. */
function conditionsHideRow(key: (typeof CONDITIONS_ORDER)[number]): ConfigVariant {
  return {
    type: 'fullscreen-weather', name: `conditions-no-${key.toLowerCase()}`, kind: 'networked', stubKey: 'weather', stubBody: FORECAST_BODY,
    extraStubs: { 'air-quality': { aqi: 2, pm25: 8.4, pm10: 12.1, o3: 48.2, no2: 15.6 } },
    config: { view: 'conditions', [CARD_TOGGLE[key]]: false },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-card-airQuality"]')).toHaveCount(1);
      await expect(mod.locator(`[data-testid="fsw-card-${key}"]`)).toHaveCount(0);
      const drawn = (await drawnCards(mod)).filter((k) => k !== 'airQuality');
      expect(drawn).toEqual(CONDITIONS_ORDER.filter((k) => k !== key));
    },
  };
}

export const FULLSCREEN_WEATHER_FORECAST_VARIANTS: ConfigVariant[] = [
  {
    // The Conditions view with every card on: air quality, then all ten in
    // the page's order, the compass and the gauge among them.
    type: 'fullscreen-weather', name: 'conditions-all-cards', kind: 'networked', stubKey: 'weather', stubBody: FORECAST_BODY,
    extraStubs: { 'air-quality': { aqi: 2, pm25: 8.4, pm10: 12.1, o3: 48.2, no2: 15.6 } },
    config: { view: 'conditions' },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-card-airQuality"]')).toHaveCount(1);
      await expect(mod.locator('[data-testid="fsw-compass"]')).toHaveCount(1);
      await expect(mod.locator('[data-testid="fsw-gauge"]')).toHaveCount(1);
      await expect(mod).toContainText('Gusts: 14 mph W');
      const drawn = (await drawnCards(mod)).filter((k) => k !== 'airQuality');
      expect(drawn).toEqual([...CONDITIONS_ORDER]);
    },
  },
  {
    // showMap removes the radar card from the Forecast view.
    type: 'fullscreen-weather', name: 'forecast-no-map', kind: 'networked', stubKey: 'weather', stubBody: FORECAST_BODY,
    config: { view: 'forecast', showMap: false },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-hours"]')).toBeVisible();
      await expect(mod.locator('[data-testid="fsw-map"]')).toHaveCount(0);
    },
  },
  {
    // The map card reads its own zoom: the base tiles name it in their URL.
    type: 'fullscreen-weather', name: 'forecast-map-zoom', kind: 'networked', stubKey: 'weather', stubBody: FORECAST_BODY, allowsExternal: true,
    extraStubs: { 'rain-map': RAIN_MAP_BODY },
    config: { view: 'forecast', mapZoom: 8 },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-map"] img[src*="openstreetmap.org/8/"]').first()).toBeAttached();
    },
  },
  {
    // The dark basemap is the light tiles under a CSS filter.
    type: 'fullscreen-weather', name: 'forecast-map-dark', kind: 'networked', stubKey: 'weather', stubBody: FORECAST_BODY, allowsExternal: true,
    extraStubs: { 'rain-map': RAIN_MAP_BODY },
    config: { view: 'forecast', mapStyle: 'dark' },
    expect: async (mod) => {
      const img = mod.locator('[data-testid="fsw-map"] img[src*="tile.openstreetmap.org"]').first();
      await expect(img).toBeAttached();
      await expect(img).toHaveAttribute('style', /invert/);
    },
  },
  {
    // The light basemap is the light tiles under a desaturating filter, and the
    // filter sits on the base tiles only, never on the radar overlay.
    type: 'fullscreen-weather', name: 'forecast-map-light', kind: 'networked', stubKey: 'weather', stubBody: FORECAST_BODY, allowsExternal: true,
    extraStubs: { 'rain-map': RAIN_MAP_BODY },
    config: { view: 'forecast', mapStyle: 'light' },
    expect: async (mod) => {
      const img = mod.locator('[data-testid="fsw-map"] img[src*="tile.openstreetmap.org"]').first();
      await expect(img).toBeAttached();
      await expect(img).toHaveAttribute('style', /saturate/);
    },
  },
  {
    // mapAnimate off holds the newest frame: no timeline dots.
    type: 'fullscreen-weather', name: 'forecast-map-still', kind: 'networked', stubKey: 'weather', stubBody: FORECAST_BODY, allowsExternal: true,
    extraStubs: { 'rain-map': RAIN_MAP_BODY },
    config: { view: 'forecast', mapAnimate: false },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-map"] img[src*="tile.openstreetmap.org"]').first()).toBeAttached();
      await expect(mod.locator('[data-testid="rain-map-timeline"]')).toHaveCount(0);
    },
  },
  cardRow('forecast-no-wind', 'showWind', 'fsw-card-wind', 'forecast'),
  cardRow('forecast-no-sun', 'showSun', 'fsw-card-sun', 'forecast'),
  {
    // The two instruments the Forecast page draws under the map, and the
    // gauge, which leads the Conditions page once the cards ahead of it are off.
    type: 'fullscreen-weather', name: 'forecast-instruments', kind: 'networked', stubKey: 'weather', stubBody: FORECAST_BODY, allowsExternal: true,
    config: { view: 'forecast' },
    expect: async (mod) => {
      await expect(mod.locator('[data-testid="fsw-compass"]')).toHaveCount(1);
      await expect(mod.locator('[data-testid="fsw-sun-arc"]')).toHaveCount(1);
      await expect(mod).toContainText('Gusts: 14 mph W');
    },
  },
  cardRow('conditions-no-air-quality', 'showAirQuality', 'fsw-card-airQuality'),
  ...CONDITIONS_ORDER.map(conditionsHideRow),
];
