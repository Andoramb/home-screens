import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FULLSCREEN_WEATHER_CARDS, FULLSCREEN_WEATHER_CARDS, resolveWeatherCards, offWeatherCards, isDefaultWeatherCards,
} from '../fullscreen-weather-cards';

describe('resolveWeatherCards', () => {
  it('gives an unset list the default, every card on, wind and sunrise first', () => {
    expect(resolveWeatherCards({})).toEqual([...DEFAULT_FULLSCREEN_WEATHER_CARDS]);
    expect(DEFAULT_FULLSCREEN_WEATHER_CARDS.slice(0, 2)).toEqual(['wind', 'sun']);
    expect([...DEFAULT_FULLSCREEN_WEATHER_CARDS].sort()).toEqual([...FULLSCREEN_WEATHER_CARDS].sort());
  });

  it('keeps a saved order as it is', () => {
    expect(resolveWeatherCards({ cards: ['pressure', 'moon'] })).toEqual(['pressure', 'moon']);
  });

  it('drops names it cannot draw and repeats, keeping the first', () => {
    expect(resolveWeatherCards({ cards: ['moon', 'tides', 'moon', 42, 'uv'] })).toEqual(['moon', 'uv']);
  });

  it('reads an empty list as every card off, not as unset', () => {
    expect(resolveWeatherCards({ cards: [] })).toEqual([]);
  });

  it('treats a non-list as unset', () => {
    expect(resolveWeatherCards({ cards: 'moon' })).toEqual([...DEFAULT_FULLSCREEN_WEATHER_CARDS]);
  });
});

describe('offWeatherCards', () => {
  it('lists what is not on, in default order', () => {
    expect(offWeatherCards(['moon', 'wind'])).toEqual(DEFAULT_FULLSCREEN_WEATHER_CARDS.filter((c) => c !== 'moon' && c !== 'wind'));
    expect(offWeatherCards(DEFAULT_FULLSCREEN_WEATHER_CARDS)).toEqual([]);
  });
});

describe('isDefaultWeatherCards', () => {
  it('is true only for the default list in the default order', () => {
    expect(isDefaultWeatherCards(DEFAULT_FULLSCREEN_WEATHER_CARDS)).toBe(true);
    expect(isDefaultWeatherCards([...DEFAULT_FULLSCREEN_WEATHER_CARDS].reverse())).toBe(false);
    expect(isDefaultWeatherCards(DEFAULT_FULLSCREEN_WEATHER_CARDS.slice(1))).toBe(false);
  });
});
