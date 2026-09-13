import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportedTimetable } from '@/lib/timetable-import';
import type { TimetableData, TimetableSubject } from '@/types/timetables';

const state = vi.hoisted(() => ({
  csv: vi.fn(),
  saved: null as TimetableData | null,
  /** Make the stand-in store reject a write that changes a week. */
  refuseWeeks: false,
}));

vi.mock('@/lib/timetable-import', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/timetable-import')>();
  return { ...real, fetchSheetCsv: (...args: unknown[]) => state.csv(...args) };
});

vi.mock('@/lib/timetable-data', () => ({
  readTimetables: async () => ({ data: state.saved, revision: 'r1' }),
  updateTimetablesInPlace: async (change: (current: TimetableData) => TimetableData | null) => {
    const next = await change(state.saved as TimetableData);
    // The real store validates what it is handed and throws rather than writing
    // a document a read could not serve. `refuseWeeks` stands in for that, so
    // the check's behaviour when its answer is rejected can be tested.
    if (next && state.refuseWeeks && JSON.stringify(next) !== JSON.stringify(state.saved)) {
      const changedWeek = next.timetables.some(
        (timetable, index) =>
          JSON.stringify(timetable.weeks) !== JSON.stringify(state.saved!.timetables[index]?.weeks),
      );
      if (changedWeek) throw new Error('Room names can be up to 16 characters');
    }
    if (next) state.saved = next;
    return next;
  },
}));

import { readTimetableCsv } from '@/lib/timetable-import';

import {
  SYNC_INTERVAL_MS,
  _resetSyncState,
  isSyncDue,
  syncDueSheets,
  weekFromSheet,
} from '@/lib/timetable-sync';

const SUBJECTS: TimetableSubject[] = [
  { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
  { id: 'bio', code: 'Bio', name: 'Biology', color: '#43c07e', icon: 'leaf' },
];

const SHEET = 'https://docs.google.com/spreadsheets/d/abc/edit#gid=7';

/**
 * A sheet the reader will take: it wants at least three weekday columns before
 * it will believe a row is the header.
 */
const CSV = [
  'Period,Time,Monday,Tuesday,Wednesday',
  '1,08:00-08:45,Ma / 112,Bio,Ma',
  '2,08:50-09:35,Bio,Ma,Bio',
].join('\n');

function household(overrides: Partial<TimetableData['timetables'][number]> = {}): TimetableData {
  return {
    schools: [{
      id: 'school-1', name: 'Gymnasium',
      slots: [
        { kind: 'period', n: 1, start: '08:00', end: '08:45' },
        { kind: 'period', n: 2, start: '08:50', end: '09:35' },
      ],
      weekCycle: { mode: 'off' }, specialDays: [],
    }],
    subjects: SUBJECTS,
    timetables: [{
      memberId: 'leon', schoolId: 'school-1',
      weeks: { A: { mon: { 1: { subjectId: 'bio' } } } },
      source: { kind: 'sheet', url: SHEET, importedAt: '2026-09-01T08:00:00.000Z', sync: true, tab: '7' },
      ...overrides,
    }],
  };
}

const leon = () => state.saved!.timetables[0];

beforeEach(() => {
  _resetSyncState();
  state.csv.mockReset();
  state.saved = household();
  state.refuseWeeks = false;
});

describe('isSyncDue', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z');
  const source = { kind: 'sheet' as const, url: SHEET, importedAt: '2026-09-01T08:00:00.000Z', sync: true };

  it('is not due for a week that does not follow a sheet', () => {
    expect(isSyncDue(undefined, now)).toBe(false);
    expect(isSyncDue({ ...source, sync: false }, now)).toBe(false);
  });

  it('is due the first time, and then once an hour', () => {
    expect(isSyncDue(source, now)).toBe(true);
    expect(isSyncDue({ ...source, lastCheckedAt: new Date(now - 1000).toISOString() }, now)).toBe(false);
    expect(isSyncDue({ ...source, lastCheckedAt: new Date(now - SYNC_INTERVAL_MS).toISOString() }, now)).toBe(true);
  });

  it('is due when the last check time is unreadable, rather than never again', () => {
    expect(isSyncDue({ ...source, lastCheckedAt: 'not a time' }, now)).toBe(true);
  });
});

describe('weekFromSheet', () => {
  const preview = (code: string): ImportedTimetable => ({
    headerRow: 0,
    days: ['mon'],
    rows: [{ kind: 'period', n: 1, cells: { mon: { text: code, code } } }],
    unknownCodes: [],
  });

  it('matches a code by its short code or by the subject name, either case', () => {
    expect(weekFromSheet(preview('ma'), SUBJECTS).mon?.[1]).toEqual({ subjectId: 'ma' });
    expect(weekFromSheet(preview('Biology'), SUBJECTS).mon?.[1]).toEqual({ subjectId: 'bio' });
  });

  it('leaves a period empty rather than guessing at a code nobody has', () => {
    expect(weekFromSheet(preview('Werken'), SUBJECTS).mon).toBeUndefined();
  });

  it('keeps the answer the household gave for a code the sheet alone does not explain', () => {
    expect(weekFromSheet(preview('Maths'), SUBJECTS, { Maths: 'ma' }).mon?.[1]).toEqual({ subjectId: 'ma' });
    // Same folding as everything else here: the sheet may write it differently
    // on the day the answer was given and on the day it is read back.
    expect(weekFromSheet(preview('maths '), SUBJECTS, { Maths: 'ma' }).mon?.[1]).toEqual({ subjectId: 'ma' });
  });

  it('drops an answer whose subject has been deleted since, rather than writing a lesson with no subject', () => {
    expect(weekFromSheet(preview('Maths'), SUBJECTS, { Maths: 'gone' }).mon).toBeUndefined();
  });
});

describe('syncDueSheets', () => {
  it('replaces week A with what the sheet says, and records when it looked', async () => {
    state.csv.mockResolvedValue({ ok: true, text: CSV });

    expect(await syncDueSheets()).toBe(1);

    expect(leon().weeks.A.mon).toEqual({ 1: { subjectId: 'ma', room: '112' }, 2: { subjectId: 'bio' } });
    expect(leon().weeks.A.tue).toEqual({ 1: { subjectId: 'bio' }, 2: { subjectId: 'ma' } });
    expect(leon().source?.lastCheckedAt).toBeTruthy();
    expect(leon().source?.lastError).toBeUndefined();
  });

  it('re-reads the tab the import took rather than guessing at one', async () => {
    state.csv.mockResolvedValue({ ok: true, text: CSV });
    await syncDueSheets();
    expect(state.csv).toHaveBeenCalledWith(expect.anything(), '7');
  });

  it('reads the sheet through the answers the import screen recorded', async () => {
    state.saved = household({
      weeks: { A: {} },
      source: {
        kind: 'sheet', url: SHEET, importedAt: '2026-09-01T08:00:00.000Z', sync: true, tab: '7',
        codes: { Werken: 'bio' },
      },
    });
    state.csv.mockResolvedValue({
      ok: true,
      text: ['Period,Time,Monday,Tuesday,Wednesday', '1,08:00-08:45,Werken,Ma,Bio'].join('\n'),
    });

    await syncDueSheets();

    // Without the recorded answer this period comes back empty every hour, and
    // the household's choice on the import screen has to be made again.
    expect(leon().weeks.A.mon).toEqual({ 1: { subjectId: 'bio' } });
  });

  it('keeps the saved week when the sheet cannot be read, and says why', async () => {
    state.csv.mockResolvedValue({ ok: false, messageKey: 'sheetUnreachable' });

    await syncDueSheets();

    // The whole point: a wall does not go blank because Google was down.
    expect(leon().weeks.A.mon).toEqual({ 1: { subjectId: 'bio' } });
    expect(leon().source?.lastError).toBe('sheetUnreachable');
    expect(leon().source?.lastCheckedAt).toBeTruthy();
    expect(leon().source?.sync).toBe(true);
  });

  it('keeps the saved week when the sheet answers with nothing readable', async () => {
    state.csv.mockResolvedValue({ ok: true, text: 'nothing that looks like a timetable' });

    await syncDueSheets();

    expect(leon().weeks.A.mon).toEqual({ 1: { subjectId: 'bio' } });
    expect(leon().source?.lastError).toBe('tabNotFound');
  });

  it('clears an old failure once a check works again', async () => {
    state.saved = household({
      source: { kind: 'sheet', url: SHEET, importedAt: '2026-09-01T08:00:00.000Z', sync: true, tab: '7', lastError: 'sheetUnreachable' },
    });
    state.csv.mockResolvedValue({ ok: true, text: CSV });

    await syncDueSheets();

    expect(leon().source?.lastError).toBeUndefined();
  });

  it('never touches a week B built by hand', async () => {
    state.saved = household({ weeks: { A: { mon: { 1: { subjectId: 'bio' } } }, B: { fri: { 2: { subjectId: 'ma' } } } } });
    state.csv.mockResolvedValue({ ok: true, text: CSV });

    await syncDueSheets();

    expect(leon().weeks.B).toEqual({ fri: { 2: { subjectId: 'ma' } } });
  });

  it('leaves a week alone when nothing is due', async () => {
    state.saved = household({
      source: { kind: 'sheet', url: SHEET, importedAt: '2026-09-01T08:00:00.000Z', sync: true, lastCheckedAt: new Date().toISOString() },
    });

    expect(await syncDueSheets()).toBe(0);
    expect(state.csv).not.toHaveBeenCalled();
  });

  it('checks a week that is not due when it is asked to by name', async () => {
    state.saved = household({
      source: { kind: 'sheet', url: SHEET, importedAt: '2026-09-01T08:00:00.000Z', sync: false, tab: '7', lastCheckedAt: new Date().toISOString() },
    });
    state.csv.mockResolvedValue({ ok: true, text: CSV });

    expect(await syncDueSheets({ force: 'leon' })).toBe(1);
    expect(leon().weeks.A.tue).toBeDefined();
  });

  it('drops an answer for somebody who turned sync off while the fetch was in the air', async () => {
    state.csv.mockImplementation(async () => {
      // Whoever is in the editor gets the last word, even mid-fetch.
      state.saved = household({
        source: { kind: 'sheet', url: SHEET, importedAt: '2026-09-01T08:00:00.000Z', sync: false, tab: '7' },
      });
      return { ok: true, text: CSV };
    });

    await syncDueSheets();

    expect(leon().weeks.A.mon).toEqual({ 1: { subjectId: 'bio' } });
    expect(leon().source?.lastCheckedAt).toBeUndefined();
  });

  it('answers 0 rather than throwing when the store cannot be read', async () => {
    state.saved = null;
    expect(await syncDueSheets()).toBe(0);
  });
});

describe('syncDueSheets when the store refuses the week it read', () => {
  it('still records that it looked, so the timetable does not stay due forever', async () => {
    // This is the difference between an hourly check and a once-a-minute one.
    // `lastCheckedAt` is written by the same call that writes the week, so a
    // refused write used to leave nothing behind: `isSyncDue` stayed true and
    // the next wall poll started the whole round of downloads again, for the
    // life of the process.
    state.refuseWeeks = true;
    state.csv.mockResolvedValue({ ok: true, text: CSV });

    await syncDueSheets();

    expect(state.saved!.timetables[0].source?.lastCheckedAt).toBeTruthy();
    // And the week somebody already had is untouched, which is the other half of
    // the promise: a failed check never replaces a week.
    expect(state.saved!.timetables[0].weeks.A).toEqual({ mon: { 1: { subjectId: 'bio' } } });
  });
});


describe('sync regression cases', () => {
  it('keeps an explicit mapping when a code becomes an exact match for another subject', () => {
    const preview = readTimetableCsv(CSV, SUBJECTS);
    expect(weekFromSheet(preview, SUBJECTS, { ma: 'bio' }).mon?.[1]).toEqual({ subjectId: 'bio', room: '112' });
  });

  it.each(['tab', 'codes', 'importedAt', 'week', 'sync'] as const)(
    'discards an in-flight result after %s changes, including forced checks', async (field) => {
      const before = structuredClone(leon().weeks.A);
      state.csv.mockImplementation(async () => {
        if (field === 'tab') leon().source!.tab = '8';
        if (field === 'codes') leon().source!.codes = { ma: 'bio' };
        if (field === 'importedAt') leon().source!.importedAt = '2026-09-12T12:00:00.000Z';
        if (field === 'week') leon().weeks.A.fri = { 2: { subjectId: 'bio' } };
        if (field === 'sync') leon().source!.sync = false;
        return { ok: true, text: CSV };
      });
      await syncDueSheets({ force: 'leon' });
      expect(leon().weeks.A.mon).toEqual(before.mon);
      expect(leon().source?.lastCheckedAt).toBeUndefined();
      if (field === 'week') expect(leon().weeks.A.fri).toEqual({ 2: { subjectId: 'bio' } });
    },
  );

  it('updates healthy sheets and records a failed download independently', async () => {
    const other = structuredClone(leon());
    other.memberId = 'emma';
    other.source!.tab = '8';
    state.saved!.timetables.push(other);
    state.csv.mockImplementation(async (_link, tab) => {
      if (tab === '7') throw new TypeError('terminated');
      return { ok: true, text: CSV };
    });
    expect(await syncDueSheets()).toBe(2);
    expect(leon().source?.lastError).toBe('sheetUnreachable');
    expect(leon().source?.lastCheckedAt).toBeTruthy();
    expect(leon().weeks.A.mon).toEqual({ 1: { subjectId: 'bio' } });
    expect(state.saved!.timetables[1].weeks.A.mon?.[1]).toEqual({ subjectId: 'ma', room: '112' });
  });
});
