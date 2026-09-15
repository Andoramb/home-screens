import type { DisplayNode, GlobalSettings } from '@/types/config';

/**
 * The screen dots decide more than whether a row of dots is drawn: the
 * double-tap pause gesture and the rotation progress line both live on them.
 * Every surface that shows, arms or offers those asks here, so the display,
 * the editor canvas and both settings pages agree on when they exist.
 */

/** Whether a settings object (global, or already merged for one display) draws the dots. Unset means yes. */
export function showsPaginationDots(settings: Pick<GlobalSettings, 'showPaginationDots'>): boolean {
  return settings.showPaginationDots ?? true;
}

/** One display's effective value: its own override, else the shared default. */
export function displayShowsPaginationDots(
  settings: Pick<GlobalSettings, 'showPaginationDots'>,
  display: Pick<DisplayNode, 'settings'> | undefined,
): boolean {
  return display?.settings?.showPaginationDots ?? showsPaginationDots(settings);
}

/**
 * Whether the shared pause and progress-line defaults still reach any wall:
 * the shared default shows the dots, or some display turns them back on. A
 * display that turns them back on inherits those defaults, so the Defaults
 * page must keep them editable.
 */
export function paginationDotDefaultsInUse(
  sharedShowsDots: boolean,
  displays: readonly Pick<DisplayNode, 'settings'>[] | undefined,
): boolean {
  return sharedShowsDots || (displays ?? []).some((d) => d.settings?.showPaginationDots === true);
}
