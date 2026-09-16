import type { ScreenConfiguration } from '@/types/config';
import { validateDisplays, validateAllSchedules } from '@/lib/display-filter';

/**
 * The one gate every path that persists a whole config goes through: the
 * editor's save, a backup restore, and an offline snapshot restore. It
 * checks the current persisted shape only; legacy folds run after it on the
 * paths that accept older documents.
 *
 * Returns the first problem as a sentence, or `null` when the config may be
 * written. Callers that already know the value is an object may pass it as
 * `unknown`; a non-object is refused here rather than crashing a validator.
 */
export function validateConfigForWrite(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Invalid config: must be an object';
  const config = value as Partial<ScreenConfiguration>;
  if (!Array.isArray(config.screens) || !config.settings || typeof config.settings !== 'object' || Array.isArray(config.settings)) {
    return 'Invalid config: must include screens array and settings';
  }
  const mappings = config.settings.calendar?.personSources;
  if (mappings !== undefined && (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)
    || Object.values(mappings).some((ids) => !Array.isArray(ids) || ids.some((id) => typeof id !== 'string')))) {
    return 'Calendar ownership must list calendar source ids for each person.';
  }
  // The display and schedule validators walk nested records and assume the
  // shape above; a hand-edited document can still break that assumption.
  try {
    return validateDisplays(config as ScreenConfiguration) || validateAllSchedules(config as ScreenConfiguration);
  } catch {
    return 'Invalid config: malformed screens, displays or schedules';
  }
}
