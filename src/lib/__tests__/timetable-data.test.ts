import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { DEFAULT_CONFIG } from '../config';
import { getDefaultSubjects } from '../timetable-subjects';
import {
  TIMETABLE_LIMITS,
  type Timetable,
  type TimetableData,
  type TimetableSchool,
  type TimetableSlot,
  type TimetableSpecialDay,
  type TimetableSubject,
} from '@/types/timetables';

// data/timetables.json resolves against process.cwd(), so each test runs in
// its own tmp cwd and the store module is re-imported with it.
let tmpDir: string;
let origCwd: () => string;
let mod: typeof import('../timetable-data');

async function writeData(name: string, value: unknown): Promise<void> {
  const dataDir = path.join(tmpDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, name), JSON.stringify(value, null, 2));
}

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(tmpDir, 'data', name), 'utf-8')) as T;
}

async function exists(name: string): Promise<boolean> {
  try {
    await fs.access(path.join(tmpDir, 'data', name));
    return true;
  } catch {
    return false;
  }
}

const STAMP = '2026-01-05T08:00:00.000Z';
const SHEET = 'https://docs.google.com/spreadsheets/d/abc/edit';

async function seedFamily(ids: string[]): Promise<void> {
  await writeData('family.json', {
    members: ids.map((id) => ({ id, name: id, color: '#60a5fa', createdAt: STAMP, updatedAt: STAMP })),
    migrated: true,
  });
}

const period = (n: number, start: string, end: string): TimetableSlot => ({ kind: 'period', n, start, end });

const dayStamp = (offset: number): string => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);

function school(overrides: Partial<TimetableSchool> = {}): TimetableSchool {
  return {
    id: 'school-1',
    name: 'Lincoln Elementary',
    slots: [
      period(1, '08:00', '08:45'),
      { kind: 'break', label: 'Break', start: '08:45', end: '09:00' },
      period(2, '09:00', '09:45'),
    ],
    weekCycle: { mode: 'off' },
    specialDays: [],
    ...overrides,
  };
}

function subject(overrides: Partial<TimetableSubject> = {}): TimetableSubject {
  return { id: 'math', code: 'Ma', name: 'Math', color: '#4f8ef7', icon: 'triangle', ...overrides };
}

function timetable(overrides: Partial<Timetable> = {}): Timetable {
  return {
    memberId: 'kid',
    schoolId: 'school-1',
    className: '3b',
    weeks: { A: { mon: { 1: { subjectId: 'math' } } } },
    ...overrides,
  };
}

function doc(): TimetableData {
  return { schools: [school()], subjects: [subject()], timetables: [timetable()] };
}

async function refusal(promise: Promise<unknown>): Promise<{ name: string; status: number; message: string }> {
  try {
    await promise;
  } catch (error) {
    const failure = error as { name?: string; status?: number; message?: string };
    return { name: failure.name ?? '', status: failure.status ?? 0, message: failure.message ?? '' };
  }
  throw new Error('Expected the call to be refused');
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'home-screens-timetable-test-'));
  origCwd = process.cwd;
  process.cwd = () => tmpDir;
  vi.resetModules();
  mod = await import('../timetable-data');
});

afterEach(async () => {
  process.cwd = origCwd;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

describe('readTimetables', () => {
  it('starts a household that has never saved with the subjects for its language', async () => {
    const { data, revision } = await mod.readTimetables();

    expect(data.schools).toEqual([]);
    expect(data.timetables).toEqual([]);
    expect(data.subjects).toEqual(getDefaultSubjects('en-US'));
    expect(revision).toBe(mod.timetableRevision(data));
    expect(revision).toMatch(/^[0-9a-f]{24}$/);
  });

  it('writes nothing until the first save', async () => {
    await mod.readTimetables();

    expect(await exists('timetables.json')).toBe(false);
  });

  it('takes the starting subjects from the saved language', async () => {
    await writeData('config.json', {
      ...DEFAULT_CONFIG,
      settings: { ...DEFAULT_CONFIG.settings, locale: 'de-DE' },
    });

    const { data } = await mod.readTimetables();

    expect(data.subjects).toEqual(getDefaultSubjects('de-DE'));
  });

  it('leaves an empty document that was actually saved empty', async () => {
    await writeData('timetables.json', { schools: [], subjects: [], timetables: [] });

    const { data } = await mod.readTimetables();

    expect(data.subjects).toEqual([]);
  });

  it('refuses to serve a file it cannot read', async () => {
    await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'data', 'timetables.json'), '{ this is not json');

    const failure = await refusal(mod.readTimetables());

    expect(failure).toMatchObject({ name: 'TimetableError', status: 409 });
    expect(failure.message).toMatch(/could not be read/);
  });
});

describe('replaceTimetables', () => {
  beforeEach(async () => {
    await seedFamily(['kid', 'sibling']);
  });

  it('saves the whole document and answers with a new revision', async () => {
    const before = await mod.readTimetables();

    const saved = await mod.replaceTimetables({ data: doc(), revision: before.revision });

    expect(saved.data.timetables[0].memberId).toBe('kid');
    expect(saved.revision).not.toBe(before.revision);
    expect(await readJson<TimetableData>('timetables.json')).toEqual(saved.data);
  });

  it('hands back the same revision the next read computes', async () => {
    const before = await mod.readTimetables();
    const saved = await mod.replaceTimetables({ data: doc(), revision: before.revision });

    const again = await mod.readTimetables();

    expect(again.data).toEqual(saved.data);
    expect(again.revision).toBe(saved.revision);
  });

  it('tidies what it saves', async () => {
    const before = await mod.readTimetables();
    const messy = doc();
    messy.schools[0].name = '  Lincoln Elementary  ';
    messy.subjects[0].color = '#4F8EF7';
    messy.timetables[0].weeks.A = { mon: {}, tue: { 1: { subjectId: 'math', room: ' 204 ' } } };

    const { data } = await mod.replaceTimetables({ data: messy, revision: before.revision });

    expect(data.schools[0].name).toBe('Lincoln Elementary');
    expect(data.subjects[0].color).toBe('#4f8ef7');
    expect(data.timetables[0].weeks.A).toEqual({ tue: { 1: { subjectId: 'math', room: '204' } } });
  });

  it('carries a school\'s holiday region to disk and back', async () => {
    // The wall reads this off the saved school every few hours, so it has to
    // survive the round trip rather than only the validator.
    const before = await mod.readTimetables();
    const withRegion = doc();
    withRegion.schools[0].holidayRegion = 'DE-NW';

    await mod.replaceTimetables({ data: withRegion, revision: before.revision });

    expect((await readJson<TimetableData>('timetables.json')).schools[0].holidayRegion).toBe('DE-NW');
    expect((await mod.readTimetables()).data.schools[0].holidayRegion).toBe('DE-NW');
  });

  it('asks for a revision before saving', async () => {
    const failure = await refusal(mod.replaceTimetables({ data: doc(), revision: undefined }));

    expect(failure).toMatchObject({ name: 'TimetableError', status: 400 });
    expect(failure.message).toMatch(/Reopen the timetables page/);
    expect(await exists('timetables.json')).toBe(false);
  });

  it('refuses a save that started from an older copy', async () => {
    const before = await mod.readTimetables();
    await mod.replaceTimetables({ data: doc(), revision: before.revision });
    const saved = await readJson<TimetableData>('timetables.json');

    const stale = doc();
    stale.schools[0].name = 'Somebody else typed this';
    const failure = await refusal(mod.replaceTimetables({ data: stale, revision: before.revision }));

    expect(failure).toMatchObject({ name: 'TimetableError', status: 409 });
    expect(failure.message).toMatch(/Somebody else changed the timetables/);
    expect(await readJson<TimetableData>('timetables.json')).toEqual(saved);
  });

  it('refuses a timetable for somebody who is not in the family', async () => {
    const before = await mod.readTimetables();
    const orphan = doc();
    orphan.timetables[0].memberId = 'ghost';

    const failure = await refusal(mod.replaceTimetables({ data: orphan, revision: before.revision }));

    expect(failure).toMatchObject({ name: 'TimetableError', status: 409 });
    expect(failure.message).toMatch(/no longer in the family/);
    expect(await exists('timetables.json')).toBe(false);
  });

  it('refuses a document that does not add up, and writes nothing', async () => {
    const before = await mod.readTimetables();
    const broken = doc();
    broken.timetables = [timetable(), timetable({ className: '4a' })];

    const failure = await refusal(mod.replaceTimetables({ data: broken, revision: before.revision }));

    expect(failure).toMatchObject({ name: 'TimetableError', status: 400 });
    expect(failure.message).toMatch(/One person cannot have two timetables/);
    expect(await exists('timetables.json')).toBe(false);
  });

  it('refuses to save on top of a file it cannot read', async () => {
    await fs.mkdir(path.join(tmpDir, 'data'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'data', 'timetables.json'), '{ this is not json');

    const failure = await refusal(mod.replaceTimetables({ data: doc(), revision: 'whatever' }));

    expect(failure).toMatchObject({ name: 'TimetableError', status: 409 });
    expect(failure.message).toMatch(/could not be read/);
  });
});

describe('validateTimetableData', () => {
  it('accepts a sound document', () => {
    expect(mod.validateTimetableData(doc())).toBeNull();
  });

  it('accepts a week B at a school that alternates weeks', () => {
    const alternating = doc();
    alternating.schools[0].weekCycle = { mode: 'parity', oddWeek: 'A' };
    alternating.timetables[0].weeks.B = { mon: { 1: { subjectId: 'math' } } };

    expect(mod.validateTimetableData(alternating)).toBeNull();
  });

  it.each([
    [null],
    ['a document'],
    [[]],
  ])('says what is wrong with %p', (raw) => {
    expect(mod.validateTimetableData(raw)).toMatch(/schools, subjects and timetables/);
  });

  const rejections: Array<[string, (draft: TimetableData) => void, RegExp]> = [
    ['more schools than allowed', (draft) => {
      draft.schools = Array.from({ length: TIMETABLE_LIMITS.maxSchools + 1 }, (_, i) => school({ id: `school-${i}` }));
    }, /up to 16 schools/],
    ['more periods than a school can have', (draft) => {
      draft.schools[0].slots = Array.from({ length: TIMETABLE_LIMITS.maxSlotsPerSchool + 1 }, (_, i) => period(i + 1, '08:00', '08:45'));
    }, /up to 16 periods and breaks/],
    ['more subjects than allowed', (draft) => {
      draft.subjects = Array.from({ length: TIMETABLE_LIMITS.maxSubjects + 1 }, (_, i) => subject({ id: `subject-${i}` }));
    }, /up to 64 subjects/],
    ['more timetables than allowed', (draft) => {
      draft.timetables = Array.from({ length: TIMETABLE_LIMITS.maxTimetables + 1 }, (_, i) => timetable({ memberId: `member-${i}` }));
    }, /up to 64 timetables/],
    ['more special days than a school can have', (draft) => {
      draft.schools[0].specialDays = Array.from({ length: TIMETABLE_LIMITS.maxSpecialDaysPerSchool + 1 }, (_, i): TimetableSpecialDay => ({
        date: dayStamp(i),
        label: 'Day off',
        kind: 'off',
      }));
    }, /up to 64 special days/],
    ['a school name that is too long', (draft) => {
      draft.schools[0].name = 'x'.repeat(TIMETABLE_LIMITS.maxNameLength + 1);
    }, /School names can be up to 60 characters/],
    ['a short code that is too long', (draft) => {
      draft.subjects[0].code = 'x'.repeat(TIMETABLE_LIMITS.maxCodeLength + 1);
    }, /Short codes can be up to 6 characters/],
    ['a room name that is too long', (draft) => {
      draft.timetables[0].usualRoom = 'x'.repeat(TIMETABLE_LIMITS.maxRoomLength + 1);
    }, /Room names can be up to 16 characters/],
    ['a packing note that is too long', (draft) => {
      draft.subjects[0].bring = 'x'.repeat(TIMETABLE_LIMITS.maxBringLength + 1);
    }, /What to bring can be up to 40 characters/],
    ['a time that is not on a 24 hour clock', (draft) => {
      draft.schools[0].slots[0].start = '8:00';
    }, /times look like 08:15/],
    ['a period that ends before it starts', (draft) => {
      draft.schools[0].slots = [period(1, '09:00', '08:00')];
    }, /has to end later than it starts/],
    ['periods that overlap', (draft) => {
      draft.schools[0].slots = [period(1, '08:00', '09:00'), period(2, '08:30', '09:30')];
    }, /in time order without overlapping/],
    ['a period number used twice', (draft) => {
      draft.schools[0].slots = [period(1, '08:00', '08:45'), period(1, '09:00', '09:45')];
    }, /uses period 1 twice/],
    ['two schools with the same id', (draft) => {
      draft.schools = [school(), school({ name: 'Roosevelt Middle' })];
    }, /Two schools share the same id/],
    ['two subjects with the same id', (draft) => {
      draft.subjects = [subject(), subject({ code: 'Ph', name: 'Physics' })];
    }, /Two subjects share the same id/],
    ['a school with no name', (draft) => {
      draft.schools[0].name = '   ';
    }, /Give school 1 a name/],
    ['a subject colour that is not a colour', (draft) => {
      draft.subjects[0].color = 'blue';
    }, /needs a colour/],
    ['a special day on a date that does not exist', (draft) => {
      draft.schools[0].specialDays = [{ date: '2026-02-31', label: 'Carnival', kind: 'off' }];
    }, /need a real date/],
    ['a short day that never says when it ends', (draft) => {
      draft.schools[0].specialDays = [{ date: '2026-02-16', label: 'Carnival', kind: 'ends-after' }];
    }, /which period the day on 2026-02-16 ends after/],
    ['a holiday region that is not a region code', (draft) => {
      draft.schools[0].holidayRegion = 'Nordrhein-Westfalen';
    }, /region code/],
    ['a timetable at a school that is not listed', (draft) => {
      draft.timetables[0].schoolId = 'gone';
    }, /points at a school that is not in the list/],
    ['a lesson whose subject nobody teaches', (draft) => {
      draft.timetables[0].weeks.A = { mon: { 1: { subjectId: 'chemistry' } } };
    }, /not in the subject list/],
    ['two timetables for one person', (draft) => {
      draft.timetables = [timetable(), timetable({ className: '4a' })];
    }, /One person cannot have two timetables/],
    ['a week B at a school that does not alternate', (draft) => {
      draft.timetables[0].weeks.B = { mon: { 1: { subjectId: 'math' } } };
    }, /does not alternate weeks/],
    ['a spreadsheet link that is not a link', (draft) => {
      draft.timetables[0].source = { kind: 'sheet', url: 'not-a-link', importedAt: STAMP, sync: false };
    }, /has to start with https/],
    ['a last-checked time that is not a time', (draft) => {
      draft.timetables[0].source = { kind: 'sheet', url: SHEET, importedAt: STAMP, sync: true, lastCheckedAt: 'yesterday' };
    }, /last checked/],
  ];

  it.each(rejections)('turns down %s', (_label, breakIt, reason) => {
    const draft = doc();
    breakIt(draft);

    expect(mod.validateTimetableData(draft)).toMatch(reason);
  });

  it('keeps the holiday region a school is in, as the lookup takes it', () => {
    // Which holidays close a school is the school's own business. A household
    // with children in two states gets both right only while the code travels
    // with the school, and a code saved in the case it was typed in would be a
    // second, silently different region to the lookup.
    const draft = doc();
    draft.schools[0].holidayRegion = 'de-nw';

    expect(mod.validateTimetableData(draft)).toBeNull();
    expect(mod.cleanTimetableData(draft).schools[0].holidayRegion).toBe('DE-NW');
  });

  it('takes a whole country as a region, for the countries that publish one set of dates', () => {
    // Belgium and Luxembourg have no regions at all, so their own code is
    // what the lookup takes.
    const draft = doc();
    draft.schools[0].holidayRegion = 'LU';

    expect(mod.validateTimetableData(draft)).toBeNull();
    expect(mod.cleanTimetableData(draft).schools[0].holidayRegion).toBe('LU');
  });

  it('treats a blank holiday region as none at all', () => {
    // None is the absence of the field, not an empty string: an empty string
    // saved on the school would have the wall ask about a region of nothing.
    const draft = doc();
    draft.schools[0].holidayRegion = '   ';

    expect(mod.cleanTimetableData(draft).schools[0]).not.toHaveProperty('holidayRegion');
  });

  it('still reads a document saved before the sheet check existed', () => {
    // `tab`, `lastCheckedAt` and `lastError` arrived with the hourly check. A
    // household that imported before it did has none of them, and their
    // timetable has to keep working rather than being refused on read.
    const draft = doc();
    draft.timetables[0].source = { kind: 'sheet', url: SHEET, importedAt: STAMP, sync: true };

    expect(mod.validateTimetableData(draft)).toBeNull();
  });

  it('keeps the answers the import screen recorded, and drops the ones that no longer point anywhere', () => {
    const draft = doc();
    draft.timetables[0].source = {
      kind: 'sheet', url: SHEET, importedAt: STAMP, sync: true, tab: '7',
      codes: { Maths: 'math', Werken: 'deleted-subject', '   ': 'math' },
    };

    // A choice the household made is worth keeping; one pointing at a subject
    // that has been deleted since is not, and it must not cost them the save.
    expect(mod.validateTimetableData(draft)).toBeNull();
    expect(mod.cleanTimetableData(draft).timetables[0].source?.codes).toEqual({ Maths: 'math' });
  });

  it('keeps what the hourly check writes back', () => {
    const draft = doc();
    draft.timetables[0].source = {
      kind: 'sheet', url: SHEET, importedAt: STAMP, sync: true,
      tab: '7', lastCheckedAt: STAMP, lastError: 'sheetUnreachable',
    };

    expect(mod.validateTimetableData(draft)).toBeNull();
    expect(mod.cleanTimetableData(draft).timetables[0].source).toEqual({
      kind: 'sheet', url: SHEET, importedAt: STAMP, sync: true,
      tab: '7', lastCheckedAt: STAMP, lastError: 'sheetUnreachable',
    });
  });
});
