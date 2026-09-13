// @vitest-environment jsdom

import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import type { DayKey, TimetableSchool, TimetableSubject, TimetableWeek } from '@/types/timetables';
import PaintGrid from '../PaintGrid';
import { paintedCell, type TimetableBrush } from '../use-timetable-draft';

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

/** The grid plus the small piece of the tab that owns the week and the brush. */
function Harness({ brush, week = {} }: { brush: TimetableBrush; week?: TimetableWeek }) {
  const [painted, setPainted] = useState<TimetableWeek>(week);
  return (
    <PaintGrid
      school={SCHOOL}
      week={painted}
      subjects={SUBJECTS}
      onPaint={(day: DayKey, period: number) =>
        setPainted((current) => {
          const cells = { ...(current[day] ?? {}) };
          const next = paintedCell(cells[period], brush);
          if (next === undefined) delete cells[period];
          else cells[period] = next;
          return { ...current, [day]: cells };
        })
      }
    />
  );
}

function render(brush: TimetableBrush, week?: TimetableWeek) {
  return renderUI(<Harness brush={brush} week={week} />, {
    wrapper: ({ children }) => (
      <I18nProvider locale="en-US" blob={{ core, editor, modules }}>
        {children}
      </I18nProvider>
    ),
  });
}

const cell = (name: string) => screen.getByRole('button', { name });

afterEach(cleanup);

describe('PaintGrid', () => {
  it('paints the cell the pointer goes down on', () => {
    render({ kind: 'subject', subjectId: 'ma' });
    fireEvent.pointerDown(cell('Monday, period 1, Free'));
    expect(cell('Monday, period 1, Mathe')).toBeTruthy();
  });

  it('erases with the eraser brush', () => {
    render({ kind: 'clear' }, { mon: { 1: { subjectId: 'ma' } } });
    fireEvent.pointerDown(cell('Monday, period 1, Mathe'));
    expect(cell('Monday, period 1, Free')).toBeTruthy();
  });

  it('keeps painting across the cells a drag crosses, and stops when it ends', () => {
    render({ kind: 'subject', subjectId: 'de' });
    fireEvent.pointerDown(cell('Monday, period 1, Free'));
    fireEvent.pointerMove(cell('Tuesday, period 1, Free'));
    fireEvent.pointerMove(cell('Wednesday, period 1, Free'));
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(cell('Thursday, period 1, Free'));

    expect(cell('Monday, period 1, Deutsch')).toBeTruthy();
    expect(cell('Tuesday, period 1, Deutsch')).toBeTruthy();
    expect(cell('Wednesday, period 1, Deutsch')).toBeTruthy();
    expect(cell('Thursday, period 1, Free')).toBeTruthy();
  });

  it('paints nothing on a pointer that moves without going down first', () => {
    render({ kind: 'subject', subjectId: 'ma' });
    fireEvent.pointerMove(cell('Monday, period 1, Free'));
    expect(cell('Monday, period 1, Free')).toBeTruthy();
  });

  it('moves with the arrow keys and paints with Space or Enter', () => {
    render({ kind: 'subject', subjectId: 'ma' });
    const start = cell('Monday, period 1, Free');
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
    expect(cell('Tuesday, period 1, Mathe')).toBeTruthy();

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: ' ' });
    expect(cell('Tuesday, period 2, Mathe')).toBeTruthy();
  });

  it('keeps the arrows inside the grid at its edges', () => {
    render({ kind: 'subject', subjectId: 'ma' });
    const start = cell('Monday, period 1, Free');
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
    expect(cell('Monday, period 1, Mathe')).toBeTruthy();
  });

  it('draws the break between the periods, and only the periods take paint', () => {
    render({ kind: 'subject', subjectId: 'ma' });
    // Shown in the household's clock, not as the 24-hour string it is stored as.
    expect(screen.getByText('Pause 8:35 AM–8:55 AM')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(10);
  });

  it('shows the other week under a cell the two weeks disagree on', () => {
    renderUI(
      <PaintGrid
        school={SCHOOL}
        week={{ mon: { 1: { subjectId: 'ma' } } }}
        otherWeek={{ mon: { 1: { subjectId: 'de' } } }}
        otherLetter="B"
        subjects={SUBJECTS}
        onPaint={() => {}}
      />,
      {
        wrapper: ({ children }) => (
          <I18nProvider locale="en-US" blob={{ core, editor, modules }}>
            {children}
          </I18nProvider>
        ),
      },
    );
    expect(screen.getByText('B: De')).toBeTruthy();

    // The line has room for the short code only, so the cell's own name and
    // its tooltip carry the other week's lesson in full. Without that the
    // weeks read as identical to anybody who cannot see the line.
    const differing = screen.getByRole('button', { name: /^Monday, period 1, Mathe,/ });
    expect(differing.getAttribute('aria-label')).toContain('Deutsch');
    expect(differing.getAttribute('title')).toBe(differing.getAttribute('aria-label'));
  });
});
