import { describe, expect, it } from 'vitest';
import { TIMETABLE_LIMITS, type TimetableData } from '@/types/timetables';
import {
  makeNote,
  noteIsComplete,
  paintedCell,
  sanitizeTimetableData,
  shortCodeFor,
  stashedWeeksB,
  stopFollowingEditedWeek,
  withRestoredWeeksB,
  withAddedSubject,
  withCellDetails,
  withSubjectDetails,
  usedSubjectIds,
  withPaintedCell,
  withWeekCycle,
  withWeeksAB,
  withoutSchool,
  withNote,
  withoutNote,
  withoutSubject,
  withoutTimetable,
} from '../use-timetable-draft';

function household(): TimetableData {
  return {
    schools: [
      {
        id: 'school-1',
        name: 'Gymnasium',
        slots: [
          { kind: 'period', n: 1, start: '07:50', end: '08:35' },
          { kind: 'break', label: 'Pause', start: '08:35', end: '08:55' },
          { kind: 'period', n: 2, start: '08:55', end: '09:40' },
        ],
        weekCycle: { mode: 'off' },
        specialDays: [],
      },
    ],
    subjects: [
      { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
      { id: 'de', code: 'De', name: 'Deutsch', color: '#f26363', icon: 'book' },
    ],
    timetables: [
      { memberId: 'leon', schoolId: 'school-1', weeks: { A: { mon: { 1: { subjectId: 'ma' } } } } },
    ],
  };
}

describe('painting a cell', () => {
  it('keeps the room and the course when the same subject is painted again', () => {
    const cell = { subjectId: 'ma', room: '204', course: 'LK' };
    expect(paintedCell(cell, { kind: 'subject', subjectId: 'ma' })).toBe(cell);
    expect(paintedCell(cell, { kind: 'subject', subjectId: 'de' })).toEqual({ subjectId: 'de' });
  });

  it('clears with the eraser and writes lunch with the lunch brush', () => {
    expect(paintedCell({ subjectId: 'ma' }, { kind: 'clear' })).toBeUndefined();
    expect(paintedCell(undefined, { kind: 'lunch' })).toEqual({ lunch: true });
  });

  it('paints and erases one person\'s week without touching the document around it', () => {
    const data = household();
    const painted = withPaintedCell(data, 'leon', 'A', 'tue', 2, { kind: 'subject', subjectId: 'de' });
    expect(painted.timetables[0].weeks.A.tue).toEqual({ 2: { subjectId: 'de' } });
    expect(painted.timetables[0].weeks.A.mon).toEqual({ 1: { subjectId: 'ma' } });
    expect(data.timetables[0].weeks.A.tue).toBeUndefined();

    const erased = withPaintedCell(painted, 'leon', 'A', 'mon', 1, { kind: 'clear' });
    expect(erased.timetables[0].weeks.A.mon).toBeUndefined();
  });

  it('lists the subjects a week uses, so the palette can lead with them', () => {
    expect([...usedSubjectIds(household().timetables[0])]).toEqual(['ma']);
  });
});

describe('two weeks', () => {
  it('copies week A across and turns the school\'s rule on, because the store needs both', () => {
    const next = withWeeksAB(household(), 'leon', true);
    expect(next.timetables[0].weeks.B).toEqual({ mon: { 1: { subjectId: 'ma' } } });
    expect(next.schools[0].weekCycle).toEqual({ mode: 'parity', oddWeek: 'A' });

    next.timetables[0].weeks.B!.mon![1] = { subjectId: 'de' };
    expect(next.timetables[0].weeks.A.mon![1]).toEqual({ subjectId: 'ma' });
  });

  it('drops the second week when the rule that gives it meaning is turned off', () => {
    const two = withWeeksAB(household(), 'leon', true);
    const off = withWeekCycle(two, 'school-1', { mode: 'off' });
    expect(off.timetables[0].weeks.B).toBeUndefined();
    expect(off.schools[0].weekCycle).toEqual({ mode: 'off' });
  });

  it('hands back the second weeks the rule was holding up, so a rule turned off by mistake costs nothing', () => {
    const two = withWeeksAB(household(), 'leon', true);
    const stash = stashedWeeksB(two, 'school-1');
    expect(Object.keys(stash)).toEqual(['leon']);

    const off = withWeekCycle(two, 'school-1', { mode: 'off' });
    const on = withWeekCycle(off, 'school-1', { mode: 'parity', oddWeek: 'A' });
    expect(withRestoredWeeksB(on, stash).timetables[0].weeks.B).toEqual({ mon: { 1: { subjectId: 'ma' } } });
  });
});

describe('removing a subject', () => {
  it('takes it out of every week that used it', () => {
    const next = withoutSubject(household(), 'ma');
    expect(next.subjects.map((subject) => subject.id)).toEqual(['de']);
    expect(next.timetables[0].weeks.A.mon).toBeUndefined();
  });
});

describe('what gets sent', () => {
  it('leaves a half-typed row on screen and out of the save', () => {
    const data = household();
    data.schools[0].slots.push({ kind: 'break', label: '   ', start: '09:40', end: '09:55' });
    data.subjects.push({ id: 'blank', code: '', name: '', color: '#ffffff', icon: 'book' });
    data.schools[0].specialDays.push({ date: '2027-02-08', label: '', kind: 'off' });

    const sent = sanitizeTimetableData(data);
    expect(sent.schools[0].slots).toHaveLength(3);
    expect(sent.subjects.map((subject) => subject.id)).toEqual(['ma', 'de']);
    expect(sent.schools[0].specialDays).toEqual([]);
  });

  it('keeps referenced blank subjects so validation refuses the save without deleting lessons', () => {
    const data = household();
    data.subjects.push({ id: 'blank', code: '', name: '', color: '#ffffff', icon: 'book' });
    data.timetables[0].weeks.A.tue = { 1: { subjectId: 'blank' }, 2: { lunch: true } };

    const sent = sanitizeTimetableData(data);
    expect(sent.timetables[0].weeks.A.tue).toEqual(data.timetables[0].weeks.A.tue);
    expect(sent.subjects).toContainEqual(data.subjects[2]);
  });

  it('drops a second week at a school that does not alternate', () => {
    const data = household();
    data.timetables[0].weeks.B = { mon: { 1: { subjectId: 'de' } } };
    expect(sanitizeTimetableData(data).timetables[0].weeks.B).toBeUndefined();
  });

  it('drops a nameless school nobody is at', () => {
    const data = household();
    data.schools.push({ id: 'school-2', name: '  ', slots: [], weekCycle: { mode: 'off' }, specialDays: [] });
    const sent = sanitizeTimetableData(data);
    expect(sent.schools.map((school) => school.id)).toEqual(['school-1']);
    expect(sent.timetables.map((timetable) => timetable.memberId)).toEqual(['leon']);
  });

  it('keeps a nameless school somebody is at, rather than deleting their week with it', () => {
    // Dropping it took every week pointing at it out of the save as well, so
    // one cleared text box deleted every child at that school, permanently and
    // with nothing said. Kept instead: the store answers "give school 1 a
    // name" and the refusal is on screen where it can be acted on.
    const data = household();
    data.schools[0].name = '  ';
    const sent = sanitizeTimetableData(data);
    expect(sent.schools.map((school) => school.id)).toEqual(['school-1']);
    expect(sent.timetables.map((timetable) => timetable.memberId)).toEqual(['leon']);
  });
});

describe('shortCodeFor', () => {
  // A sheet spells subjects out where a cell has room for an abbreviation, and
  // the store refuses a code over six characters, so an import that reused the
  // sheet's own word was refused whole with nothing a parent could act on.
  it('leaves a code that already fits alone', () => {
    expect(shortCodeFor('Math')).toBe('Math');
    expect(shortCodeFor('Music')).toBe('Music');
    expect(shortCodeFor('PE')).toBe('PE');
    expect(shortCodeFor('  Art  ')).toBe('Art');
  });

  it('takes the initials of something spelled out in several words', () => {
    expect(shortCodeFor('English Language Arts')).toBe('ELA');
    expect(shortCodeFor('Physical Education')).toBe('PE');
    expect(shortCodeFor('Wirtschaft-Politik')).toBe('WP');
  });

  it('shortens one long word to something that reads as an abbreviation', () => {
    expect(shortCodeFor('Geography')).toBe('Geog');
    expect(shortCodeFor('Chemistry')).toBe('Chem');
    expect(shortCodeFor('Französisch')).toBe('Fran');
  });

  it('never hands back more than the store will take', () => {
    const long = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta';
    expect(shortCodeFor(long).length).toBeLessThanOrEqual(TIMETABLE_LIMITS.maxCodeLength);
    expect(shortCodeFor('Sozialwissenschaften').length).toBeLessThanOrEqual(TIMETABLE_LIMITS.maxCodeLength);
  });
});

describe('the room and the course on a lesson', () => {
  const week = (data: TimetableData) => data.timetables[0].weeks;

  it('sets a room on one lesson and leaves its siblings alone', () => {
    const next = withCellDetails(household(), 'leon', 'A', 'mon', 1, { room: '112' });
    expect(week(next).A.mon?.[1]).toEqual({ subjectId: 'ma', room: '112' });
    expect(week(next).A.mon?.[2]).toEqual(week(household()).A.mon?.[2]);
  });

  it('clears a field that is emptied rather than storing a blank one', () => {
    const withRoom = withCellDetails(household(), 'leon', 'A', 'mon', 1, { room: '112', course: 'LK' });
    const cleared = withCellDetails(withRoom, 'leon', 'A', 'mon', 1, { room: '  ' });
    expect(cleared.timetables[0].weeks.A.mon?.[1]).toEqual({ subjectId: 'ma', course: 'LK' });
  });

  it('leaves lunch alone, which is not a lesson and has nowhere to be', () => {
    const data = withPaintedCell(household(), 'leon', 'A', 'tue', 1, { kind: 'lunch' });
    const next = withCellDetails(data, 'leon', 'A', 'tue', 1, { room: '112' });
    expect(next.timetables[0].weeks.A.tue?.[1]).toEqual({ lunch: true });
  });

  it('copies a room to every lesson of that subject, in both weeks', () => {
    // A school teaches chemistry in the chemistry lab, and a fixed room does not
    // alternate, so "every Mathe" means both weeks or it means nothing.
    const both = withWeeksAB(household(), 'leon', true);
    const next = withSubjectDetails(both, 'leon', 'ma', { room: 'A107' });
    for (const letter of ['A', 'B'] as const) {
      const weeks = next.timetables[0].weeks[letter];
      const lessons = Object.values(weeks ?? {}).flatMap((day) => Object.values(day));
      const maths = lessons.filter((cell) => 'subjectId' in cell && cell.subjectId === 'ma');
      expect(maths.length).toBeGreaterThan(0);
      expect(maths.every((cell) => 'room' in cell && cell.room === 'A107')).toBe(true);
    }
  });
});

describe('a week that follows a spreadsheet', () => {
  const followed = (): TimetableData => ({
    ...household(),
    timetables: household().timetables.map((timetable) => ({
      ...timetable,
      source: { kind: 'sheet' as const, url: 'https://docs.google.com/spreadsheets/d/a/edit', importedAt: '2026-09-01T08:00:00.000Z', sync: true },
    })),
  });

  it('stops following once somebody edits it by hand', () => {
    const before = followed();
    const after = withPaintedCell(before, 'leon', 'A', 'tue', 4, { kind: 'subject', subjectId: 'ma' });
    const result = stopFollowingEditedWeek(before, after, 'leon');
    expect(result.stopped).toBe('leon');
    expect(result.data.timetables[0].source?.sync).toBe(false);
  });

  it('keeps following when the change was somewhere else entirely', () => {
    const before = followed();
    const after = withAddedSubject(before, { id: 'new', code: 'Wk', name: 'Werken', color: '#fff', icon: 'book' });
    expect(stopFollowingEditedWeek(before, after, 'leon').stopped).toBeNull();
    expect(stopFollowingEditedWeek(before, after, 'leon').data.timetables[0].source?.sync).toBe(true);
  });

  it('says nothing about a week that was never following one', () => {
    const before = household();
    const after = withPaintedCell(before, 'leon', 'A', 'tue', 4, { kind: 'subject', subjectId: 'ma' });
    expect(stopFollowingEditedWeek(before, after, 'leon').stopped).toBeNull();
  });
});

describe('taking a timetable away again', () => {
  it('removes one person’s week and leaves everybody else alone', () => {
    // Adding a timetable was a one-way door: somebody picked by mistake, or a
    // child who has left school, stayed on the list for good, and the only way
    // out was removing them from the family, which takes their chores and their
    // calendar with them.
    const data: TimetableData = {
      ...household(),
      timetables: [
        { memberId: 'leon', schoolId: 'school-1', weeks: { A: { mon: { 1: { subjectId: 'ma' } } } } },
        { memberId: 'mia', schoolId: 'school-1', weeks: { A: { tue: { 2: { subjectId: 'de' } } } } },
      ],
    };

    const next = withoutTimetable(data, 'leon');

    expect(next.timetables.map((timetable) => timetable.memberId)).toEqual(['mia']);
    // Nothing else about the household moves: the school and the shared subject
    // list belong to everybody.
    expect(next.schools).toEqual(data.schools);
    expect(next.subjects).toEqual(data.subjects);
  });

  it('does nothing for somebody who has no timetable', () => {
    const data = household();
    expect(withoutTimetable(data, 'nobody').timetables).toEqual(data.timetables);
  });
});

describe('taking a school away again', () => {
  it('removes a school nobody is at', () => {
    const data: TimetableData = {
      ...household(),
      schools: [
        household().schools[0],
        { id: 'school-2', name: 'Grundschule', slots: [], weekCycle: { mode: 'off' }, specialDays: [] },
      ],
    };

    expect(withoutSchool(data, 'school-2').schools.map((school) => school.id)).toEqual(['school-1']);
  });

  it('keeps a school somebody still goes to', () => {
    // The store refuses a timetable whose school is not in the list, so removing
    // one out from under a week would either refuse the whole document or
    // quietly move a child onto another school's bell times. The UI says who is
    // there instead of offering the delete.
    const data = household();
    expect(withoutSchool(data, 'school-1')).toEqual(data);
  });
});

describe('dates to remember', () => {
  const noted = (): TimetableData => {
    const data = household();
    data.timetables[0] = {
      ...data.timetables[0],
      notes: [
        { id: 'n2', date: '2026-09-18', kind: 'bring', text: 'Brotdose' },
        { id: 'n1', date: '2026-09-11', kind: 'test', subjectId: 'ma', text: 'Mathe-Arbeit' },
      ],
    };
    return data;
  };

  it('adds a date in date order and replaces one with the same id', () => {
    const added = withNote(household(), 'leon', { id: 'a', date: '2026-09-25', kind: 'cancelled', periods: [2] });
    expect(added.timetables[0].notes?.map((n) => n.id)).toEqual(['a']);
    const earlier = withNote(added, 'leon', { id: 'b', date: '2026-09-11', kind: 'bring', text: 'Hut' });
    expect(earlier.timetables[0].notes?.map((n) => n.id)).toEqual(['b', 'a']);
    const changed = withNote(earlier, 'leon', { id: 'a', date: '2026-09-01', kind: 'cancelled', periods: [1] });
    expect(changed.timetables[0].notes?.map((n) => [n.id, n.date])).toEqual([['a', '2026-09-01'], ['b', '2026-09-11']]);
    // Somebody with no timetable gets nothing.
    expect(withNote(household(), 'emma', { id: 'x', date: '2026-09-11', kind: 'bring', text: 'Hut' })).toEqual(household());
  });

  it('takes a date away, and the list with it once empty', () => {
    const data = noted();
    const one = withoutNote(data, 'leon', 'n1');
    expect(one.timetables[0].notes?.map((n) => n.id)).toEqual(['n2']);
    const none = withoutNote(one, 'leon', 'n2');
    expect('notes' in none.timetables[0]).toBe(false);
  });

  it('knows when a date is finished enough to save', () => {
    expect(noteIsComplete(makeNote('test'))).toBe(false);
    expect(noteIsComplete({ id: 'x', date: '2026-09-11', kind: 'test' })).toBe(false);
    expect(noteIsComplete({ id: 'x', date: '2026-09-11', kind: 'test', subjectId: 'ma' })).toBe(true);
    expect(noteIsComplete({ id: 'x', date: '2026-09-11', kind: 'bring', text: '  ' })).toBe(false);
    expect(noteIsComplete({ id: 'x', date: '2026-09-11', kind: 'bring', text: 'Hut' })).toBe(true);
    expect(noteIsComplete({ id: 'x', date: '2026-09-11', kind: 'cancelled', periods: [] })).toBe(false);
    expect(noteIsComplete({ id: 'x', date: '2026-09-11', kind: 'cancelled', periods: [1] })).toBe(true);
  });

  it('keeps unfinished dates out of the save and trims the finished ones', () => {
    const data = withNote(withNote(noted(), 'leon', makeNote('bring')), 'leon', { id: 'sp', date: '2026-09-20', kind: 'bring', text: '  Turnbeutel ' });
    const sent = sanitizeTimetableData(data);
    expect(sent.timetables[0].notes?.map((n) => n.id)).toEqual(['n1', 'n2', 'sp']);
    expect(sent.timetables[0].notes?.find((n) => n.id === 'sp')?.text).toBe('Turnbeutel');
    // The unfinished one is still in the draft.
    expect(data.timetables[0].notes).toHaveLength(4);
  });

  it('drops a test in a subject that is being removed', () => {
    const data = withoutSubject(noted(), 'ma');
    expect(data.timetables[0].notes?.map((n) => n.id)).toEqual(['n2']);
    expect(JSON.stringify(data.timetables[0].weeks)).not.toContain('"ma"');
  });

  it('leaves the dates alone when the week cycle or the second week changes', () => {
    const data = noted();
    expect(withWeeksAB(data, 'leon', true).timetables[0].notes).toEqual(data.timetables[0].notes);
    expect(withWeekCycle(data, 'school-1', { mode: 'parity', oddWeek: 'A' }).timetables[0].notes).toEqual(data.timetables[0].notes);
  });
});
