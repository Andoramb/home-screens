'use client';

import { useEditorStore, getActiveFullscreenTheme } from '@/stores/editor-store';
import { getThemeTokens, migrateFromDarkMode } from '@/lib/fullscreen-themes';
import type { FullscreenThemeTokens } from '@/lib/fullscreen-themes';

/**
 * The full-screen theme the selected display paints with where a module sets
 * none: its own override, else the shared default (see
 * `getActiveFullscreenTheme`). Undefined when neither is set.
 */
export function useActiveFullscreenTheme(): string | undefined {
  return useEditorStore((s) => (s.config ? getActiveFullscreenTheme(s.config, s.selectedDisplayId) : undefined));
}

/**
 * The theme tokens a fullscreen module is actually rendering with, resolved
 * in the editor exactly as the canvas preview resolves them: the module's own
 * `theme`, else the selected display's full-screen theme, else the legacy
 * `darkMode` mapping. Config sections use this so a swatch that depends on
 * the theme (the accent picker) shows the color the preview is painting
 * rather than the Linen fallback for an inherited theme.
 */
export function useFullscreenThemeTokens(
  theme: string | undefined,
  darkMode?: boolean,
): FullscreenThemeTokens {
  const fullscreenTheme = useActiveFullscreenTheme();
  return getThemeTokens(theme ?? fullscreenTheme ?? migrateFromDarkMode(darkMode));
}
