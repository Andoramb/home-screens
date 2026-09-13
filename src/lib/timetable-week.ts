import { DAY_KEYS, type TimetableWeek } from '@/types/timetables';
import type { ImportedCell, ImportedTimetable } from './timetable-import';

/** Convert a parsed sheet into a week using the caller's subject choices. */
export function weekFromImportedRows(
  preview: ImportedTimetable,
  resolveSubject: (cell: ImportedCell) => string | undefined,
): TimetableWeek {
  const week: TimetableWeek = {};
  for (const row of preview.rows) {
    if (row.kind !== 'period') continue;
    for (const day of DAY_KEYS) {
      const cell = row.cells[day];
      if (!cell) continue;
      const subjectId = resolveSubject(cell);
      if (!subjectId) continue;
      const cells = week[day] ?? {};
      cells[row.n] = { subjectId, ...(cell.room ? { room: cell.room } : {}) };
      week[day] = cells;
    }
  }
  return week;
}
