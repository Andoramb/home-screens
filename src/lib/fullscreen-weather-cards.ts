import type { FullscreenWeatherCard } from '@/types/config';

/**
 * The full-screen weather module's card list: which of the Forecast and
 * Conditions cards are on, and in what order. The rules here are what the
 * editor's list, the wall's views and the migration all read, so a card the
 * editor offers is a card the wall knows how to draw.
 */

/** Every card the two views can draw. */
export const FULLSCREEN_WEATHER_CARDS: readonly FullscreenWeatherCard[] = [
  'wind', 'sun', 'moon', 'uv', 'feelsLike', 'humidity', 'precipitation', 'visibility', 'pressure', 'nowcast', 'airQuality',
];

/**
 * The order a fresh module gets, every card on. Wind and sunrise lead so the
 * Forecast page shows those two under its map, the way the phone does; the
 * rest follow the phone's Conditions page, with the minute-by-minute strip
 * last because only Pirate Weather fills it.
 */
export const DEFAULT_FULLSCREEN_WEATHER_CARDS: readonly FullscreenWeatherCard[] = [
  'wind', 'sun', 'airQuality', 'moon', 'uv', 'feelsLike', 'precipitation', 'visibility', 'humidity', 'pressure', 'nowcast',
];

const KNOWN: ReadonlySet<string> = new Set(FULLSCREEN_WEATHER_CARDS);

/**
 * The cards a module has on, in order. Unset means the default list; a
 * hand-edited list is tidied (unknown names and repeats dropped) rather than
 * trusted, so the views only ever see cards they can draw, each once.
 */
export function resolveWeatherCards(config: { cards?: unknown }): FullscreenWeatherCard[] {
  if (!Array.isArray(config.cards)) return [...DEFAULT_FULLSCREEN_WEATHER_CARDS];
  const out: FullscreenWeatherCard[] = [];
  for (const card of config.cards) {
    if (typeof card === 'string' && KNOWN.has(card) && !out.includes(card as FullscreenWeatherCard)) {
      out.push(card as FullscreenWeatherCard);
    }
  }
  return out;
}

/** The cards that are off: every known card not on the list, in default order. */
export function offWeatherCards(cards: readonly FullscreenWeatherCard[]): FullscreenWeatherCard[] {
  return DEFAULT_FULLSCREEN_WEATHER_CARDS.filter((card) => !cards.includes(card));
}

/** Whether a list is the default list, card for card. */
export function isDefaultWeatherCards(cards: readonly FullscreenWeatherCard[]): boolean {
  return cards.length === DEFAULT_FULLSCREEN_WEATHER_CARDS.length
    && cards.every((card, i) => card === DEFAULT_FULLSCREEN_WEATHER_CARDS[i]);
}
