// @vitest-environment jsdom

import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import type { TimetableData, TimetableSchool, TimetableSubject } from '@/types/timetables';
import PaintGrid from '../PaintGrid';
import {
  withCellDetails,
  withPaintedCell,
  withSubjectDetails,
  type TimetableBrush,
} from '../use-timetable-draft';

const SCHOOL: TimetableSchool = {
  id: 'school-1',
  name: 'Gymnasium',
  slots: [
    { kind: 'period', n: 1, start: '07:50', end: '08:35' },
    { kind: 'break', label: 'Pause', start: '08:35', end: '08:55' },
    { kind: 'period', n: 2, start: '08:55', end: '09:40' },
  ],
  weekCycle: { mode: 'off' },
  specialDays: [],
};

const SUBJECTS: TimetableSubject[] = [
  { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
  { id: 'de', code: 'De', name: 'Deutsch', color: '#f26363', icon: 'book' },
];

const MEMBER = 'kid';

/**
 * Two weeks of Mathe, one lesson of it already in a room, a lunch and a
 * Deutsch: enough to tell "every Mathe" from "every lesson".
 */
function makeData(): TimetableData {
  return {
    schools: [SCHOOL],
    subjects: SUBJECTS,
    timetables: [
      {
        memberId: MEMBER,
        schoolId: SCHOOL.id,
        weeks: {
          A: {
            mon: { 1: { subjectId: 'ma' }, 2: { lunch: true } },
            tue: { 1: { subjectId: 'ma', room: '112' } },
            wed: { 1: { subjectId: 'de' } },
          },
          B: { mon: { 1: { subjectId: 'ma' } } },
        },
      },
    ],
  };
}

/** The draft as the grid last handed it back, and how often it was written to. */
let saved: TimetableData = makeData();
let saves = 0;

/** The grid, plus the piece of the tab that owns the draft it edits. */
function Harness({ brush }: { brush: TimetableBrush }) {
  const [data, setData] = useState(makeData);
  useEffect(() => {
    saved = data;
  }, [data]);

  const timetable = data.timetables[0];
  return (
    <PaintGrid
      school={SCHOOL}
      week={timetable.weeks.A}
      otherWeek={timetable.weeks.B}
      otherLetter="B"
      subjects={data.subjects}
      onPaint={(day, period) => setData((current) => withPaintedCell(current, MEMBER, 'A', day, period, brush))}
      details={{
        onCell: (day, period, patch) => {
          saves += 1;
          setData((current) => withCellDetails(current, MEMBER, 'A', day, period, patch));
        },
        onSubject: (subjectId, patch) => {
          saves += 1;
          setData((current) => withSubjectDetails(current, MEMBER, subjectId, patch));
        },
      }}
    />
  );
}

function render(brush: TimetableBrush = { kind: 'subject', subjectId: 'de' }) {
  return renderUI(<Harness brush={brush} />, {
    wrapper: ({ children }) => (
      <I18nProvider locale="en-US" blob={{ core, editor, modules }}>
        {children}
      </I18nProvider>
    ),
  });
}

const pencil = (where: string) => screen.getByRole('button', { name: `Room and course group for Mathe, ${where}` });
const lessonOf = (letter: 'A' | 'B', day: 'mon' | 'tue' | 'wed', period: number) =>
  saved.timetables[0].weeks[letter]?.[day]?.[period];

/** Open the editor the way somebody does: press the pencil, then let it go. */
function openEditor(where: string) {
  const button = pencil(where);
  fireEvent.pointerDown(button);
  fireEvent.click(button);
}

beforeEach(() => {
  saved = makeData();
  saves = 0;
});

afterEach(cleanup);

describe('CellDetails', () => {
  it('offers a pencil on every lesson, and none on lunch or a free period', () => {
    render();
    // Three lessons in the week on screen: two of Mathe and one of Deutsch.
    expect(screen.getAllByRole('button', { name: /^Room and course group for/ })).toHaveLength(3);
    expect(pencil('Monday, period 1')).toBeTruthy();
    // Monday period 2 is lunch, and Monday period 3 does not exist at all.
    expect(screen.queryByRole('button', { name: /Room and course.*Monday, period 2/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Room and course.*Thursday/ })).toBeNull();
  });

  it('keeps the pencil on show when the lesson already carries a room', () => {
    render();
    // Tuesday has a room, and the grid draws it under the subject.
    expect(screen.getByText('112')).toBeTruthy();
    expect(pencil('Tuesday, period 1').className).not.toContain('opacity-0');
    expect(pencil('Monday, period 1').className).toContain('opacity-0');
  });

  it('opens the editor without painting the cell the pencil sits in', () => {
    render({ kind: 'subject', subjectId: 'de' });
    openEditor('Monday, period 1');

    expect(screen.getByRole('dialog', { name: 'Room and course group for Mathe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Monday, period 1, Mathe' })).toBeTruthy();
    expect(lessonOf('A', 'mon', 1)).toEqual({ subjectId: 'ma' });
  });

  it('saves the room when the field is left, and not on every keystroke', () => {
    render();
    openEditor('Monday, period 1');

    const room = screen.getByLabelText('Room');
    fireEvent.change(room, { target: { value: 'Lab 2' } });
    expect(saves).toBe(0);

    fireEvent.blur(room);
    expect(saves).toBe(1);
    expect(lessonOf('A', 'mon', 1)).toEqual({ subjectId: 'ma', room: 'Lab 2' });
  });

  it('clears the room when the field is emptied', () => {
    render();
    openEditor('Tuesday, period 1');

    const room = screen.getByLabelText('Room');
    fireEvent.change(room, { target: { value: '' } });
    fireEvent.blur(room);
    expect(lessonOf('A', 'tue', 1)).toEqual({ subjectId: 'ma' });
  });

  it('copies the room and the course to every lesson of that subject, in both weeks', () => {
    render();
    openEditor('Monday, period 1');

    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'Lab 2' } });
    fireEvent.change(screen.getByLabelText('Course group'), { target: { value: 'LK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy to every Mathe, both weeks' }));

    const both = { subjectId: 'ma', room: 'Lab 2', course: 'LK' };
    expect(lessonOf('A', 'mon', 1)).toEqual(both);
    expect(lessonOf('A', 'tue', 1)).toEqual(both);
    expect(lessonOf('B', 'mon', 1)).toEqual(both);
    // Deutsch is a different subject and keeps what it had.
    expect(lessonOf('A', 'wed', 1)).toEqual({ subjectId: 'de' });
  });

  it('copies only the boxes that have something in them', () => {
    // Sending both fields whatever they held turned the copy into a mass
    // delete: a lesson with no room of its own cleared the room off every
    // other lesson of that subject, in both weeks, with no confirm and no undo.
    render();
    openEditor('Monday, period 1');

    fireEvent.change(screen.getByLabelText('Course group'), { target: { value: 'LK' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy to every Mathe, both weeks' }));

    expect(lessonOf('A', 'tue', 1)).toEqual({ subjectId: 'ma', room: '112', course: 'LK' });
    expect(lessonOf('A', 'mon', 1)).toEqual({ subjectId: 'ma', course: 'LK' });
    expect(lessonOf('B', 'mon', 1)).toEqual({ subjectId: 'ma', course: 'LK' });
  });

  it('will not copy nothing, and says what to type first', () => {
    render();
    openEditor('Monday, period 1');

    const copy = screen.getByRole('button', { name: 'Copy to every Mathe, both weeks' }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    expect(screen.getByTestId('cell-details-copy-hint')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'Lab 2' } });
    expect(copy.disabled).toBe(false);
    expect(screen.queryByTestId('cell-details-copy-hint')).toBeNull();
  });

  it('commits and closes on Escape, leaving the window behind it open', () => {
    render();
    openEditor('Monday, period 1');

    let escapesHeard = 0;
    const listener = () => {
      escapesHeard += 1;
    };
    window.addEventListener('keydown', listener);
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'Lab 2' } });
    fireEvent.keyDown(screen.getByLabelText('Room'), { key: 'Escape' });
    window.removeEventListener('keydown', listener);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lessonOf('A', 'mon', 1)).toEqual({ subjectId: 'ma', room: 'Lab 2' });
    expect(escapesHeard).toBe(0);
  });

  it('closes on Done, and on a press anywhere outside it', () => {
    render();
    openEditor('Monday, period 1');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Focus comes back to the lesson, not to nothing at the top of the page.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Monday, period 1, Mathe' }));

    openEditor('Monday, period 1');
    fireEvent.pointerDown(screen.getByTestId('cell-details-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
