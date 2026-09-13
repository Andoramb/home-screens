/**
 * The identity of a spreadsheet's own subject code.
 *
 * Its own module, and deliberately a tiny one, because three places need to
 * agree on it and one of them runs in the browser:
 *
 * - the reader (`timetable-import.ts`) matches a sheet's codes against the
 *   household's subjects with it;
 * - the import screen (`timetable-modal/ImportView.tsx`) keys the household's
 *   answers by it;
 * - the hourly check (`timetable-sync.ts`) looks those answers up by it.
 *
 * The reader reaches the network and resolves DNS, so the import screen cannot
 * import from it: doing so pulls `dns` and `fs` into the editor bundle and the
 * build stops. Keeping the function here is what lets all three share one rule
 * rather than each carrying its own slightly different one, which is how a
 * re-read came to lose an answer the import had saved.
 */

/**
 * Lowercase, drop accents, settle German ß, and collapse whitespace, so
 * "Französisch", "FRANZOESISCH" and "franzosisch" all compare equal.
 *
 * NFD separates a letter from its accent and the range below is the combining
 * marks, so "ö" becomes "o". ß is handled on its own because decomposition does
 * not touch it.
 */
export function foldSheetCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}
