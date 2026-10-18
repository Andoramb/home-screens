import { create } from 'zustand';

/**
 * What the editor's weather preview learned about each source, kept where
 * the property panel can read it. `usePreviewData` fetches every source the
 * canvas needs and writes the forecast length here, so a days field can say
 * "WeatherAPI.com sends 3 days" from the real answer for the real key
 * instead of a table that would be wrong for a paid plan.
 */
interface PreviewWeatherState {
  /** Forecast days each source sent on its latest preview fetch, by provider id. */
  forecastDays: Record<string, number>;
  setForecastDays: (forecastDays: Record<string, number>) => void;
}

export const usePreviewWeatherStore = create<PreviewWeatherState>((set) => ({
  forecastDays: {},
  setForecastDays: (forecastDays) => set({ forecastDays }),
}));

/**
 * How many forecast days `provider` sent the preview, or null while nothing
 * has landed or the fetch failed. Null means "say nothing", never a guess.
 */
export function useForecastDaysSent(provider: string): number | null {
  return usePreviewWeatherStore((s) => s.forecastDays[provider] ?? null);
}
