// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import modules from '@/translations/en-US/modules.json';
import { I18nProvider } from '@/i18n/provider';
import type { TimetableImportCheckResult } from '@/lib/timetable-api';
import type { ImportedTimetable } from '@/lib/timetable-import';
import type { FamilyMember } from '@/types/family';
import type { TimetableData } from '@/types/timetables';

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: (url: string, init?: RequestInit) => state.request(url, init),
  isSessionExpired: () => false,
}));

import ImportView, { buildImport } from '../ImportView';

const SHEET = 'https://docs.google.com/spreadsheets/d/abc/edit#gid=0';

/** The import screen's own value for "add this code as a subject of its own". */
const AS_NEW = '\u0000new';

const DATA: TimetableData = {
  schools: [
    {
      id: 'school-1',
      name: 'Gymnasium',
      slots: [{ kind: 'period', n: 1, start: '08:00', end: '08:45' }],
      weekCycle: { mode: 'off' },
      specialDays: [],
    },
  ],
  subjects: [{ id: 'ma', code: 'Ma', name: 'Math', color: '#4f8ef7', icon: 'triangle' }],
  timetables: [],
};

/** One tab holding a single lesson, written the way the sheet writes it. */
function preview(code: string): ImportedTimetable {
  return {
    headerRow: 0,
    days: ['mon'],
    rows: [{ kind: 'period', n: 1, cells: { mon: { text: code, code } } }],
    unknownCodes: [],
  };
}

const sourceFor = (data: TimetableData, memberId: string) =>
  data.timetables.find((timetable) => timetable.memberId === memberId)?.source;

describe('buildImport', () => {
  it('records the tab each person was taken from, not just the link they share', () => {
    const next = buildImport(
      DATA,
      [
        { memberId: 'leon', preview: preview('Ma'), url: SHEET, tab: '7' },
        { memberId: 'emma', preview: preview('Ma'), url: SHEET, tab: '12' },
      ],
      {},
      true,
      'school-1',
    );

    // One link, a tab per child: with only the link recorded, every hourly
    // re-read goes to whichever tab the sheet hands out first and both children
    // end up with the same week.
    expect(sourceFor(next, 'leon')?.tab).toBe('7');
    expect(sourceFor(next, 'emma')?.tab).toBe('12');
  });

  it('records the subject the household chose for a code the sheet does not explain', () => {
    const next = buildImport(
      DATA,
      [{ memberId: 'leon', preview: preview('Maths'), url: SHEET, tab: '7' }],
      // Answers are keyed by the folded code, which is how the hourly re-read
      // looks them up.
      { maths: 'ma' },
      true,
      'school-1',
    );

    expect(next.timetables[0].weeks.A.mon).toEqual({ 1: { subjectId: 'ma' } });
    expect(sourceFor(next, 'leon')?.codes).toEqual({ maths: 'ma' });
  });

  it('records a code it turned into a subject of its own, so a later rename cannot lose it', () => {
    const next = buildImport(
      DATA,
      [{ memberId: 'leon', preview: preview('Werken'), url: SHEET, tab: '7' }],
      { werken: AS_NEW },
      true,
      'school-1',
    );

    const added = next.subjects.find((subject) => subject.name === 'Werken');
    expect(added).toBeDefined();
    expect(sourceFor(next, 'leon')?.codes).toEqual({ werken: added?.id });
  });

  it('answers every spelling of one code, not just the one the screen showed', () => {
    // The sheet writes Bio, BIO and bio in the same week and the import screen
    // asks about it once. Keying the answer by the raw spelling meant the other
    // two periods were saved empty, and then the hourly check - which does fold
    // - filled them in an hour later, changing a week somebody had checked.
    const mixed: ImportedTimetable = {
      headerRow: 0,
      days: ['mon', 'tue', 'wed'],
      rows: [
        {
          kind: 'period',
          n: 1,
          cells: {
            mon: { text: 'Bio', code: 'Bio' },
            tue: { text: 'BIO', code: 'BIO' },
            wed: { text: 'bio', code: 'bio' },
          },
        },
      ],
      unknownCodes: [],
    };
    const next = buildImport(
      DATA,
      [{ memberId: 'leon', preview: mixed, url: SHEET, tab: '7' }],
      { bio: 'ma' },
      true,
      'school-1',
    );

    const week = next.timetables[0].weeks.A;
    expect(week.mon).toEqual({ 1: { subjectId: 'ma' } });
    expect(week.tue).toEqual({ 1: { subjectId: 'ma' } });
    expect(week.wed).toEqual({ 1: { subjectId: 'ma' } });
    expect(sourceFor(next, 'leon')?.codes).toEqual({ bio: 'ma' });
  });

  it('puts every spelling of a new code on one subject, not three', () => {
    const mixed: ImportedTimetable = {
      headerRow: 0,
      days: ['mon', 'tue'],
      rows: [
        {
          kind: 'period',
          n: 1,
          cells: { mon: { text: 'Werken', code: 'Werken' }, tue: { text: 'WERKEN', code: 'WERKEN' } },
        },
      ],
      unknownCodes: [],
    };
    const next = buildImport(
      DATA,
      [{ memberId: 'leon', preview: mixed, url: SHEET, tab: '7' }],
      { werken: AS_NEW },
      true,
      'school-1',
    );

    expect(next.subjects.filter((subject) => subject.name.toLowerCase() === 'werken')).toHaveLength(1);
  });

  it('puts an imported week at the school it was told to, not the first one', () => {
    // A household with a primary and a secondary school used to get the first
    // school for both children, which drew the second week against the wrong
    // bells and hid every lesson past that school's last one.
    const twoSchools: TimetableData = {
      ...DATA,
      schools: [
        DATA.schools[0],
        {
          id: 'school-2',
          name: 'Grundschule',
          slots: [{ kind: 'period', n: 1, start: '08:15', end: '09:00' }],
          weekCycle: { mode: 'off' },
          specialDays: [],
        },
      ],
    };
    const next = buildImport(
      twoSchools,
      [{ memberId: 'leon', preview: preview('Ma'), url: SHEET, tab: '7' }],
      {},
      true,
      'school-2',
    );

    expect(next.timetables[0].schoolId).toBe('school-2');
  });

  it('records nothing for a code the household chose to leave empty', () => {
    const next = buildImport(
      DATA,
      [{ memberId: 'leon', preview: preview('Werken'), url: SHEET, tab: '7' }],
      { werken: '' },
      true,
      'school-1',
    );

    expect(next.timetables[0].weeks.A.mon).toBeUndefined();
    expect(sourceFor(next, 'leon')?.codes).toBeUndefined();
  });

  it('leaves an import from a file with no sheet to go back to', () => {
    const next = buildImport(
      DATA,
      [{ memberId: 'leon', preview: preview('Ma'), url: '', tab: 'leon.csv' }],
      {},
      true,
      'school-1',
    );

    expect(sourceFor(next, 'leon')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The screen itself: what it says when it is refusing, or asking
// ---------------------------------------------------------------------------

function person(id: string, name: string): FamilyMember {
  return { id, name, color: '#60a5fa', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
}

const MEMBERS = [person('leon', 'Leon'), person('emma', 'Emma')];

/** A tab the reader could not place, with a suggestion it is not sure of. */
function unsureTab(): ImportedTimetable {
  return {
    headerRow: 0,
    days: ['mon'],
    rows: [{ kind: 'period', n: 1, cells: { mon: { text: 'Ge', code: 'Ge' } } }],
    unknownCodes: [{ code: 'Ge', count: 1, suggestion: { subjectId: 'ma', code: 'Ma', name: 'Math', confident: false } }],
  };
}

function render(data: TimetableData) {
  renderUI(<ImportView data={data} members={MEMBERS} onApply={() => {}} onCancel={() => {}} />, {
    wrapper: ({ children }) => (
      <I18nProvider locale="en-US" blob={{ core, editor, modules }}>
        {children}
      </I18nProvider>
    ),
  });
}

/** Paste a link and press Check, with the hub answering `answer`. */
async function check(answer: TimetableImportCheckResult) {
  state.request.mockResolvedValue({ ok: true, status: 200, json: async () => answer } as Response);
  fireEvent.change(screen.getByLabelText('Link to the sheet'), { target: { value: SHEET } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  });
}

/** jsdom has no scrolling, and the code row is reached by scrolling to it. */
const scrolled = vi.fn();

beforeEach(() => {
  state.request.mockReset();
  scrolled.mockReset();
  Element.prototype.scrollIntoView = scrolled;
});

afterEach(cleanup);

describe('the import screen says what it is waiting for', () => {
  it('explains the one-link-per-person fallback instead of showing bare boxes', async () => {
    // A sheet that will not list its tabs is ordinary, not a failure. It used
    // to answer with a panel of empty boxes and no sentence at all.
    render(DATA);
    await check({ ok: true, tabsListed: false, tabs: [] });

    expect(screen.getByText('This sheet would not list its tabs')).toBeTruthy();
    expect(screen.getByText(/Paste the link to each person/)).toBeTruthy();
    // And each box is named after whose tab it wants, so three fields are not
    // all called "Link to the sheet".
    expect(screen.getByLabelText("Link to Leon's tab")).toBeTruthy();
    expect(screen.getByLabelText("Link to Emma's tab")).toBeTruthy();
  });

  it('says a school is needed when the Import button has nowhere to put a week', async () => {
    render({ ...DATA, schools: [] });
    await check({
      ok: true,
      tabsListed: true,
      tabs: [{ gid: '0', name: 'Leon', memberId: 'leon', preview: preview('Ma') }],
    });

    expect(screen.getByText(/Add a school first, on the Schools & times tab/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Import 1 timetable/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('names the codes it is still waiting on, and takes you to the row', async () => {
    render(DATA);
    await check({
      ok: true,
      tabsListed: true,
      tabs: [{ gid: '0', name: 'Leon', memberId: 'leon', preview: unsureTab() }],
    });

    expect(screen.getByText(/Import is waiting on/)).toBeTruthy();

    // The codes themselves are the way to the row, which can be several
    // hundred pixels up a scrolling panel.
    fireEvent.click(screen.getByRole('button', { name: 'Ge' }));
    const focused = document.activeElement as HTMLSelectElement | null;
    expect(focused?.tagName).toBe('SELECT');
    expect([...(focused?.options ?? [])].some((option) => option.text === 'Pick a subject')).toBe(true);
    expect(scrolled).toHaveBeenCalled();
  });

  it('does not claim a weak suggestion has been matched, because it has not', async () => {
    render(DATA);
    await check({
      ok: true,
      tabsListed: true,
      tabs: [{ gid: '0', name: 'Leon', memberId: 'leon', preview: unsureTab() }],
    });

    // The dropdown is asking ("Pick a subject"), so the line under it must not
    // say the code is already matched to the guess.
    expect(screen.getByText('It might be Math. Pick that, pick another, or add it as new.')).toBeTruthy();
    expect(screen.queryByText(/so it is matched to that/)).toBeNull();
    // And the option that makes the code its own subject reads as a phrase
    // rather than as the palette's "+ Subject" button.
    expect(screen.getByRole('option', { name: 'Add it as a new subject' })).toBeTruthy();
  });
});
