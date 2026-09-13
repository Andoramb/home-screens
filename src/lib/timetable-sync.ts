/**
 * Keeping an imported week up to date with the spreadsheet it came from.
 *
 * A household that ticked "Keep in sync with the sheet" was promised an hourly
 * check. There is no scheduler to hang one on, and there should not be: the app
 * is one `node server.js` process on a Raspberry Pi. So the check rides the read
 * the walls already make. `GET /api/timetables` calls `syncDueSheets` and does
 * not wait for it; the answer it serves is what is on disk right now, and the
 * next poll a minute later carries the new week.
 *
 * A household with no wall up and no editor open polls nothing, and so checks
 * nothing, which is right: there is nobody to show a new week to.
 *
 * Three rules, all of them about not losing what somebody already has:
 *
 * - **A failed check never replaces a week.** The saved copy stands, the reason
 *   is recorded, and the panel in the editor says so. Google being unreachable
 *   is not a reason for a child to have no timetable on the wall.
 * - **Only week A is replaced.** That is all an import ever writes. A B week
 *   built by hand in the editor is not the sheet's to touch.
 * - **A code the household has no subject for leaves the period empty** rather
 *   than guessing at one, which is the same choice the import screen makes. The
 *   answers given on that screen are part of the source, so a code the sheet
 *   alone does not explain still lands on the subject the household picked for
 *   it.
 */

import type { Timetable, TimetableData, TimetableSource, TimetableSubject, TimetableWeek } from '@/types/timetables';
import { weekFromImportedRows } from './timetable-week';
import { logger } from '@/lib/logger';
import { readTimetables, updateTimetablesInPlace } from './timetable-data';
import { foldSheetCode } from '@/lib/timetable-codes';
import {
  fetchSheetCsv,
  parseSheetLink,
  readTimetableCsv,
  type ImportedTimetable,
  type TimetableImportMessageKey,
} from './timetable-import';

const log = logger('timetable-sync');

/** How old the last look has to be before another one is due. */
export const SYNC_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How long a check may run before the next read is allowed to start another.
 * A fetch that hangs must not wedge the sync off for the life of the process.
 */
const SYNC_STALL_MS = 5 * 60 * 1000;

/** One check at a time for the whole process, however many walls are polling. */
let running: { startedAt: number } | null = null;

/** A timetable is due when it follows a sheet and has not been looked at lately. */
export function isSyncDue(source: TimetableSource | undefined, now: number): boolean {
  if (!source || source.kind !== 'sheet' || !source.sync) return false;
  if (!source.lastCheckedAt) return true;
  const last = Date.parse(source.lastCheckedAt);
  return Number.isNaN(last) || now - last >= SYNC_INTERVAL_MS;
}

/**
 * The week a sheet now says, with every code turned into a subject id.
 *
 * Shares the import screen's grid conversion. Explicit saved choices win over
 * automatic matches; codes with no known subject are left out.
 */
export function weekFromSheet(
  preview: ImportedTimetable,
  subjects: readonly TimetableSubject[],
  codes: Record<string, string> = {},
): TimetableWeek {
  const byKey = new Map<string, string>();
  for (const subject of subjects) {
    byKey.set(fold(subject.code), subject.id);
    byKey.set(fold(subject.name), subject.id);
  }
  // Remembered choices take precedence over the parser's automatic matches.
  // Ignore choices whose subjects have since been removed.
  const known = new Set(subjects.map((subject) => subject.id));
  const answers = new Map<string, string>();
  for (const [code, subjectId] of Object.entries(codes)) {
    if (known.has(subjectId)) answers.set(fold(code), subjectId);
  }
  return weekFromImportedRows(preview, (cell) =>
    answers.get(fold(cell.code)) ?? cell.subjectId ?? byKey.get(fold(cell.code)),
  );
}

/**
 * Codes and names are matched the way the import matches them, which now means
 * literally the same function. This file used to fold with its own simpler rule
 * (trim, lowercase, strip spaces) while the import screen folded with accents
 * and ß settled as well, so a household's answer saved under one spelling could
 * not be found under the other on a re-read.
 */
const fold = foldSheetCode;

/** A check may only write back against the inputs it actually read. */
function checkVersion(timetable: Timetable, subjects: readonly TimetableSubject[]): string {
  return JSON.stringify({ source: timetable.source, week: timetable.weeks.A, subjects });
}

type CheckResult = { memberId: string; version: string } & (
  | { ok: true; week: TimetableWeek }
  | { ok: false; messageKey: TimetableImportMessageKey }
);

async function checkOne(timetable: Timetable, subjects: readonly TimetableSubject[]): Promise<CheckResult> {
  // Capture before the first await: the source can be replaced while downloading.
  const identity = { memberId: timetable.memberId, version: checkVersion(timetable, subjects) };
  const source = timetable.source;
  const link = source && parseSheetLink(source.url);
  if (!source || !link) return { ...identity, ok: false, messageKey: 'linkNotUnderstood' };

  try {
    const csv = await fetchSheetCsv(link, source.tab ?? link.gid);
    if (!csv.ok) return { ...identity, ok: false, messageKey: csv.messageKey };

    const preview = readTimetableCsv(csv.text, [...subjects]);
    if (preview.days.length === 0) return { ...identity, ok: false, messageKey: 'tabNotFound' };
    return { ...identity, ok: true, week: weekFromSheet(preview, subjects, source.codes) };
  } catch (error) {
    // A failed download must not prevent the other children’s sheets updating.
    log.error('Timetable sheet check failed:', error);
    return { ...identity, ok: false, messageKey: 'sheetUnreachable' };
  }
}

/**
 * Look at every sheet that is due, and write back what they said.
 *
 * Never throws: it is called and not awaited, so a rejection here would be an
 * unhandled one. Returns how many timetables were looked at, for the tests and
 * for the manual "Check now" button, which does await it.
 */
export async function syncDueSheets(options: { force?: string } = {}): Promise<number> {
  const now = Date.now();
  // A check somebody asked for is never turned away. The single-flight guard is
  // there to stop a dozen polling walls starting a dozen background rounds; a
  // person pressing "Check now" and being answered "nothing happened" is not
  // what it is for, and the write itself is serialized by the data transaction
  // either way.
  if (!options.force && running && now - running.startedAt < SYNC_STALL_MS) return 0;
  const ours = !options.force;
  if (ours) running = { startedAt: now };
  try {
    const { data } = await readTimetables();
    const due = data.timetables.filter((timetable) =>
      options.force ? timetable.memberId === options.force && timetable.source : isSyncDue(timetable.source, now),
    );
    if (due.length === 0) return 0;

    const results = await Promise.all(due.map((timetable) => checkOne(timetable, data.subjects)));
    const byMember = new Map(results.map((result) => [result.memberId, result]));
    const checkedAt = new Date().toISOString();

    const write = (weeks: boolean) =>
      updateTimetablesInPlace((current) => {
        let touched = false;
        const timetables = current.timetables.map((timetable) => {
          const result = byMember.get(timetable.memberId);
          const source = timetable.source;
          // Somebody may have turned sync off, or painted a cell, while the fetch
          // was in the air. Their choice is newer than this answer.
          if (!result || !source || (!options.force && !source.sync)) return timetable;
          // A tab, mapping, import, manual edit or newer check may have changed
          // even when the spreadsheet URL stayed the same.
          if (checkVersion(timetable, current.subjects) !== result.version) return timetable;
          touched = true;
          if (!result.ok) {
            return { ...timetable, source: { ...source, lastCheckedAt: checkedAt, lastError: result.messageKey } };
          }
          const { lastError: _dropped, ...cleared } = source;
          return {
            ...timetable,
            ...(weeks ? { weeks: { ...timetable.weeks, A: result.week } } : {}),
            source: { ...cleared, lastCheckedAt: checkedAt },
          };
        });
        return touched ? { ...current, timetables } : null;
      });

    try {
      await write(true);
    } catch (error) {
      // The week a sheet now says was refused by the store. Record that the
      // sheet was looked at anyway, because the alternative is far worse than a
      // stale week: with no `lastCheckedAt` the timetable stays due forever and
      // every wall's poll starts another round of downloads, turning an hourly
      // check into a once-a-minute one for the life of the process.
      log.error('Timetable sheet sync could not save the new week:', error);
      await write(false).catch((cause) => log.error('Timetable sheet sync could not record the check:', cause));
    }

    return due.length;
  } catch (error) {
    log.error('Timetable sheet sync failed:', error);
    return 0;
  } finally {
    if (ours) running = null;
  }
}

/**
 * Start a check if one is due, without waiting for it.
 *
 * The read that calls this answers with what is on disk. Making it wait would
 * put a Google round trip in front of every wall's poll for the sake of a week
 * that changes about twice a year.
 */
export function syncDueSheetsInBackground(data: TimetableData): void {
  const now = Date.now();
  if (!data.timetables.some((timetable) => isSyncDue(timetable.source, now))) return;
  void syncDueSheets();
}

/** Test seam: forget that a check is in flight. */
export function _resetSyncState(): void {
  running = null;
}
