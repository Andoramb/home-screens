import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TimetableData } from '@/types/timetables';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

// Only the call that reaches Google is stubbed. The store underneath is the
// real one, which is the point: the sync's own tests mock it away, so nothing
// there proves that what the check writes is a document the store will take.
vi.mock('@/lib/timetable-import', async () => {
  const actual = await vi.importActual<typeof import('@/lib/timetable-import')>('@/lib/timetable-import');
  return { ...actual, fetchSheetCsv: vi.fn() };
});

import { sanitizeTimetableData } from '@/components/editor/timetable-modal/use-timetable-draft';

import { fetchSheetCsv } from '@/lib/timetable-import';
import { readTimetables, replaceTimetables } from '@/lib/timetable-data';
import { syncDueSheets } from '@/lib/timetable-sync';
import { _resetSyncState } from '@/lib/timetable-sync';

const csv = vi.mocked(fetchSheetCsv);

const STAMP = '2026-09-01T08:00:00.000Z';
const SHEET = 'https://docs.google.com/spreadsheets/d/abc/edit#gid=7';

const GRID = [
  'Period,Time,Monday,Tuesday,Wednesday',
  '1,08:00-08:45,Ma / A107,Deu,Ma',
  'Pause,08:45-09:00,,,',
  '2,09:00-09:45,Deu,Ma,Deu',
].join('\n');

const now = '2026-09-01T08:00:00.000Z';
const member = (id: string, name: string) => ({ id, name, color: '#60a5fa', createdAt: now, updatedAt: now });

function saved(sync: boolean): TimetableData {
  return {
    schools: [{
      id: 'school-1', name: 'Gymnasium',
      slots: [
        { kind: 'period', n: 1, start: '08:00', end: '08:45' },
        { kind: 'break', label: 'Pause', start: '08:45', end: '09:00' },
        { kind: 'period', n: 2, start: '09:00', end: '09:45' },
      ],
      weekCycle: { mode: 'off' }, specialDays: [],
    }],
    subjects: [
      { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
      { id: 'deu', code: 'Deu', name: 'Deutsch', color: '#f26363', icon: 'book' },
    ],
    timetables: [{
      memberId: 'a', schoolId: 'school-1',
      weeks: { A: { mon: { 1: { subjectId: 'deu' } } } },
      source: { kind: 'sheet', url: SHEET, importedAt: STAMP, sync, tab: '7' },
    }],
  };
}

let root: string;

beforeEach(async () => {
  _resetSyncState();
  csv.mockReset();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-timetable-sync-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await fs.writeFile(
    path.join(root, 'data', 'family.json'),
    JSON.stringify({ members: [member('a', 'Leon')], migrated: true }),
  );
  await fs.writeFile(path.join(root, 'data', 'timetables.json'), JSON.stringify(saved(true)));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('the hourly check against the real store', () => {
  it('writes a week the store accepts, and reads back the same way the wall does', async () => {
    csv.mockResolvedValue({ ok: true, text: GRID });

    expect(await syncDueSheets()).toBe(1);

    const { data } = await readTimetables();
    const week = data.timetables[0].weeks.A;
    expect(week.mon).toEqual({ 1: { subjectId: 'ma', room: 'A107' }, 2: { subjectId: 'deu' } });
    expect(week.tue).toEqual({ 1: { subjectId: 'deu' }, 2: { subjectId: 'ma' } });
    expect(data.timetables[0].source?.lastCheckedAt).toBeTruthy();
    expect(data.timetables[0].source?.lastError).toBeUndefined();
  });

  it('records a failure on disk without touching the week that is saved', async () => {
    csv.mockResolvedValue({ ok: false, messageKey: 'sheetUnreachable' });

    await syncDueSheets();

    const { data } = await readTimetables();
    expect(data.timetables[0].weeks.A.mon).toEqual({ 1: { subjectId: 'deu' } });
    expect(data.timetables[0].source?.lastError).toBe('sheetUnreachable');
  });

  it('leaves a week that is not following its sheet alone', async () => {
    await fs.writeFile(path.join(root, 'data', 'timetables.json'), JSON.stringify(saved(false)));

    expect(await syncDueSheets()).toBe(0);
    expect(csv).not.toHaveBeenCalled();
  });
});

describe('a check that runs while somebody has the window open', () => {
  it('does not make their next save look like somebody else changed it', async () => {
    // The revision exists to stop two people overwriting each other. A
    // background job recording that it looked at a sheet is not a person, and
    // an editor open at the time was being told otherwise.
    const { revision } = await readTimetables();
    csv.mockResolvedValue({ ok: false, messageKey: 'sheetUnreachable' });

    await syncDueSheets();

    const after = await readTimetables();
    expect(after.data.timetables[0].source?.lastError).toBe('sheetUnreachable');
    expect(after.revision).toBe(revision);
  });

  it('still moves the revision when the check actually changes a week', async () => {
    const { revision } = await readTimetables();
    csv.mockResolvedValue({ ok: true, text: GRID });

    await syncDueSheets();

    expect((await readTimetables()).revision).not.toBe(revision);
  });

  it('keeps what the check recorded when the editor saves a copy that never had it', async () => {
    csv.mockResolvedValue({ ok: false, messageKey: 'sheetUnreachable' });
    await syncDueSheets();

    // The editor is holding the document as it was before the check ran, and
    // those two fields were never its to send.
    const stale = saved(true);
    const { revision } = await readTimetables();
    await replaceTimetables({ data: stale, revision });

    const { data } = await readTimetables();
    expect(data.timetables[0].source?.lastError).toBe('sheetUnreachable');
    expect(data.timetables[0].source?.lastCheckedAt).toBeTruthy();
  });
});

/**
 * The check runs off the read every wall already makes, so its failure modes are
 * measured in downloads per minute rather than in one bad answer. Whatever
 * happens, it has to record that it looked: without that the timetable stays due
 * and the next poll starts the whole round again.
 */
describe('a check whose answer the store will not take', () => {
  it('does not write an answer about a sheet the household has since changed', async () => {
    // Somebody notices a wrong link and fixes it while the fetch is in the air.
    // The answer in flight is about the old sheet, so it must not land on the
    // new one, and must not stamp the new one as checked.
    csv.mockImplementation(async () => {
      const current = await readTimetables();
      await replaceTimetables({
        revision: current.revision,
        data: {
          ...current.data,
          timetables: current.data.timetables.map((timetable) => ({
            ...timetable,
            source: { ...timetable.source!, url: 'https://docs.google.com/spreadsheets/d/other/edit#gid=1' },
          })),
        },
      });
      return { ok: true, text: GRID };
    });

    await syncDueSheets();

    const { data } = await readTimetables();
    // The week somebody already had stands, and the new link has not been
    // described as looked at.
    expect(data.timetables[0].weeks.A.mon).toEqual({ 1: { subjectId: 'deu' } });
    expect(data.timetables[0].source?.lastCheckedAt).toBeUndefined();
  });
});

describe('a check somebody pressed a button for', () => {
  it('is not turned away because a background round happens to be running', async () => {
    // The single-flight guard is there to stop a dozen polling walls starting a
    // dozen rounds. Answering a person "nothing happened" is not what it is for.
    let release: (() => void) | null = null;
    csv.mockImplementationOnce(
      () => new Promise((resolve) => {
        release = () => resolve({ ok: true, text: GRID });
      }),
    );
    const background = syncDueSheets();
    await vi.waitFor(() => expect(release).not.toBeNull());

    csv.mockResolvedValue({ ok: true, text: GRID });
    expect(await syncDueSheets({ force: 'a' })).toBe(1);

    release!();
    await background;
  });
});


it.each(['name', 'code'] as const)('does not save deleted lessons when an existing subject %s is blank', async (field) => {
  const original = await readTimetables();
  const draft = structuredClone(original.data);
  draft.subjects[1][field] = '';
  await expect(replaceTimetables({ revision: original.revision, data: sanitizeTimetableData(draft) })).rejects.toThrow();
  expect(await readTimetables()).toEqual(original);
});
