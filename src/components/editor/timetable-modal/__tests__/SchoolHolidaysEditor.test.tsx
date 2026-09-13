// @vitest-environment jsdom

/**
 * Whose holidays close a school, in the timetables window.
 *
 * The row has six states and only one of them can honestly ask for another
 * try, so every case here is about which control is offered and which sentence
 * goes under it. The one property that holds across all of them: what the
 * lookup answered decides the control, never what is saved or typed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as renderUI, screen } from '@testing-library/react';
import { useState } from 'react';
import core from '@/translations/en-US/core.json';
import editor from '@/translations/en-US/editor.json';
import { I18nProvider } from '@/i18n/provider';
import type { TimetableSchool } from '@/types/timetables';

const state = vi.hoisted(() => ({
  responses: new Map<string, unknown>(),
  /** URLs the row asked for, in order, one entry per request. */
  asked: [] as string[],
  /** URLs that answer with a failure rather than data. */
  failing: new Set<string>(),
  /**
   * The household's own settings, which is where the holiday country comes
   * from. The row used to read the country off the display language, so a
   * household running the wall in English could not reach their own state's
   * school holidays at all.
   */
  settings: { calendar: { holidayCountry: 'DE' } } as Record<string, unknown>,
}));

vi.mock('@/hooks/useEditorData', async () => {
  const { useEffect } = await import('react');
  return {
    useEditorData: (url: string | null) => {
      // One entry per request the real hook would make: on mount and whenever
      // the URL changes, not once per render.
      useEffect(() => { if (url) state.asked.push(url); }, [url]);
      return {
        data: url && !state.failing.has(url) ? state.responses.get(url) ?? null : null,
        error: url ? state.failing.has(url) : false,
        // The real hook reports false on the render that starts the request,
        // so a row that trusts this flag mistakes "still asking" for "asked
        // and got nothing". Held at false here so it cannot.
        loading: false,
        refetch: vi.fn(),
      };
    },
  };
});
// The real store is selector-based, so the stand-in has to be too: returning
// one object whatever was asked for handed every selector the same value.
vi.mock('@/stores/editor-store', () => ({
  useEditorStore: (select?: (s: unknown) => unknown) => {
    const store = { config: { settings: state.settings } };
    return select ? select(store) : store;
  },
}));

import SchoolHolidaysEditor, { clearResolvedPlaceCache } from '../SchoolHolidaysEditor';

function school(holidayRegion?: string): TimetableSchool {
  return {
    id: 'school-1',
    name: 'Gymnasium am Rhein',
    slots: [{ kind: 'period', n: 1, start: '07:50', end: '08:35' }],
    weekCycle: { mode: 'off' },
    specialDays: [],
    ...(holidayRegion ? { holidayRegion } : {}),
  };
}

/** The last school the row handed back, so a test can read what it saved. */
let savedSchool: TimetableSchool | null = null;

/**
 * The window hands the edited school straight back to the row, which is what a
 * control that commits every keystroke cannot survive: the value it writes on
 * the first character re-renders the row underneath the cursor.
 */
function Live({ initial, locale = 'en-US' }: { initial: TimetableSchool; locale?: string }) {
  const [current, setCurrent] = useState(initial);
  return (
    <I18nProvider locale={locale} blob={{ core, editor }}>
      <SchoolHolidaysEditor
        school={current}
        onChange={(change) => setCurrent((was) => {
          const next = change(was);
          savedSchool = next;
          return next;
        })}
      />
    </I18nProvider>
  );
}

const render = (initial: TimetableSchool = school(), locale = 'en-US') =>
  renderUI(<Live initial={initial} locale={locale} />);

/** Which of the six states the row says it is in. */
const holidayState = () =>
  document.querySelector('[data-holiday-state]')?.getAttribute('data-holiday-state') ?? null;

/** The sentence under the row, or '' when it stays quiet. */
const note = () => document.querySelector('[data-holiday-state] p')?.textContent ?? '';

const control = () => screen.queryByRole('combobox') ?? screen.queryByRole('textbox');

/** A country the lookup answers for, with school holiday dates. */
function germanRegions() {
  return {
    country: 'DE',
    hasSchoolHolidays: true,
    fetchedAt: '2026-09-01T09:00:00.000Z',
    // Every row of a country carries the same word for what it is, in each
    // language the lookup has it in.
    regionCategory: [{ language: 'DE', text: 'Bundesland' }, { language: 'EN', text: 'federal state' }],
    subdivisions: [
      { code: 'DE-BY', label: 'Bavaria', shortName: 'BY', names: [{ language: 'DE', text: 'Bayern' }, { language: 'EN', text: 'Bavaria' }] },
      { code: 'DE-NW', label: 'North Rhine-Westphalia', shortName: 'NW', names: [{ language: 'DE', text: 'Nordrhein-Westfalen' }] },
    ],
  };
}

/**
 * What the lookup answers for a country with no school holiday dates: either
 * one nobody publishes any for (the US, Denmark) or one that has regions but
 * no school dates among them (Spain).
 */
function noRegions(country: string, subdivisions: unknown[] = [], regionCategory: unknown[] = []) {
  return {
    country,
    subdivisions,
    regionCategory,
    hasSchoolHolidays: false,
    fetchedAt: '2026-09-01T00:00:00.000Z',
  };
}

/** One region of a country that lists them but publishes no school dates. */
function spanishRegions() {
  return noRegions(
    'ES',
    [{ code: 'ES-CT', label: 'Catalonia', shortName: 'CT', names: [{ language: 'EN', text: 'Catalonia' }] }],
    // Capitalised upstream, where the German word is not, which is why the
    // row cannot print either of them as it finds it.
    [{ language: 'EN', text: 'Autonomous community' }, { language: 'ES', text: 'Comunidad autónoma' }],
  );
}

beforeEach(() => {
  state.responses = new Map<string, unknown>();
  state.asked = [];
  state.failing = new Set<string>();
  state.settings = { calendar: { holidayCountry: 'DE' } };
  savedSchool = null;
  clearResolvedPlaceCache();
});
afterEach(cleanup);

describe('the region a school follows', () => {
  it('saves the region on the school, and takes it off again', () => {
    state.responses.set('/api/timetables/holidays?country=DE', germanRegions());
    render(school('DE-NW'));

    // The dictionary handed to the provider is the English one, so only the
    // region names, which come from the lookup, follow the display language.
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('DE-NW');

    fireEvent.change(select, { target: { value: 'DE-BY' } });
    expect(savedSchool?.holidayRegion).toBe('DE-BY');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    // None is the absence of the field, not an empty string: the store treats
    // a blank as no region, so writing one would save a difference that is not
    // one.
    expect(savedSchool).not.toHaveProperty('holidayRegion');
  });

  it('offers the regions a country does have, in the display language, plus None', () => {
    state.responses.set('/api/timetables/holidays?country=DE', germanRegions());
    render(school('DE-NW'), 'de-DE');

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      'None', 'Bayern', 'Nordrhein-Westfalen',
    ]);
  });

  it('keeps a saved region the list does not carry, rather than resetting it to None', () => {
    // Saved before the household moved, or while the lookup was down.
    state.responses.set('/api/timetables/holidays?country=DE', germanRegions());
    render(school('AT-9'));

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', 'DE-BY', 'DE-NW', 'AT-9']);
    expect(select.value).toBe('AT-9');
  });

  it('is named by the heading above it, so the control is never a bare box', () => {
    state.responses.set('/api/timetables/holidays?country=DE', germanRegions());
    render();

    expect(screen.getByRole('combobox', { name: 'School holidays' })).toBeTruthy();
  });

  it('says when the dates it is showing are the ones it saved earlier', () => {
    state.responses.set('/api/timetables/holidays?country=DE', germanRegions());
    // The route answers a map whatever it was asked for, so the school's own
    // region has to be read out of it by name rather than off the top.
    state.responses.set('/api/timetables/holidays?region=DE-NW', {
      regions: {
        'DE-NW': { region: 'DE-NW', year: 2026, ok: false, messageKey: 'schoolHolidaysStale', schoolHolidays: [], publicHolidays: [], fetchedAt: '2026-09-01T00:00:00.000Z' },
      },
    });
    render(school('DE-NW'));

    expect(document.querySelector('[data-holiday-state]')?.textContent)
      .toContain('These are the dates we saved earlier');
  });

  it('never looks up half a code on its way to being typed', () => {
    state.failing.add('/api/timetables/holidays?country=DE');
    render(school('D'));

    expect(state.asked.filter((url) => url.includes('region='))).toEqual([]);
  });
});

describe('typing a region code', () => {
  beforeEach(() => {
    // A lookup that did not answer, which is one of the two states the free
    // text box is left in: nothing is known about the country's regions, so
    // typing a code is the only way in.
    state.failing.add('/api/timetables/holidays?country=DE');
  });

  it('asks for a region code, a phrase that reads the same on both sides of the Atlantic', () => {
    render();

    const box = screen.getByRole('textbox', { name: 'School holidays' }) as HTMLInputElement;
    expect(box.placeholder).toBe('Region code, for example DE-NW');
  });

  it('keeps the box under the cursor and saves the whole code', () => {
    render();

    const box = () => screen.getByRole('textbox', { name: 'School holidays' }) as HTMLInputElement;
    const first = box();
    // Character by character, the way a parent types it.
    for (const upto of ['d', 'de', 'de-', 'de-n', 'de-nw']) {
      fireEvent.change(box(), { target: { value: upto } });
      // The same element throughout: swapping the control mid-word threw the
      // rest of the typing away.
      expect(box()).toBe(first);
    }

    // Nothing is committed until the box is left, so no half-typed code is
    // ever looked up or saved.
    expect(savedSchool).toBeNull();
    expect(state.asked.filter((url) => url.includes('region='))).toEqual([]);

    fireEvent.blur(first);
    expect(savedSchool?.holidayRegion).toBe('DE-NW');
    expect(box().value).toBe('DE-NW');
  });
});

describe('what the lookup answered', () => {
  it('says nothing while it is still working out the country', () => {
    // The country is known but its regions have not come back yet. Reading the
    // hook's loading flag called this "no regions" for one render and flashed a
    // failure sentence at a household nothing was wrong with.
    render();

    expect(holidayState()).toBe('resolving');
    expect(note()).toBe('');
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('offers the list once the country answers with one', () => {
    state.responses.set('/api/timetables/holidays?country=DE', germanRegions());
    render();

    expect(holidayState()).toBe('list');
    // Nothing is picked for the school: the row starts at None, and the note
    // says what picking one does and what leaving it does not. It leads with
    // the country's own word for the thing, not with "area".
    expect(note()).toBe(
      "Federal state: Pick the one your school's holidays follow. Leave it at None and holidays are ignored.",
    );
  });

  it('asks for nothing at all where no holiday dates exist to be had', () => {
    // The United States and Denmark are not countries the holiday service
    // covers: there is no code a household could type that would ever answer,
    // so the row stops asking for one.
    state.settings = { calendar: { holidayCountry: 'US' } };
    state.responses.set('/api/timetables/holidays?country=US', noRegions('US'));
    render();

    expect(holidayState()).toBe('no-holidays');
    expect(control()).toBeNull();
    // It names the one place a household can still mark a day off itself,
    // which is the section directly below this one.
    expect(note()).toContain('Days that are different');
    expect(note()).toContain('below');
    expect(note()).not.toMatch(/try again/i);
  });

  it('lets a region saved elsewhere be cleared even where the country has no dates', () => {
    // Saved before the household moved, or carried in with an imported
    // document. It still drives the wall, so with no control at all there
    // would be nowhere to take it back off again.
    state.settings = { calendar: { holidayCountry: 'US' } };
    state.responses.set('/api/timetables/holidays?country=US', noRegions('US'));
    render(school('DE-NW'));

    expect(holidayState()).toBe('no-holidays');
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', 'DE-NW']);

    fireEvent.change(select, { target: { value: '' } });
    expect(savedSchool).not.toHaveProperty('holidayRegion');
  });

  it('offers the regions of a country that has them but publishes no school dates', () => {
    // Spain lists nineteen of them and no school dates at all. Throwing that
    // list away left a household typing a code the row had already fetched.
    state.settings = { calendar: { holidayCountry: 'ES' } };
    state.responses.set('/api/timetables/holidays?country=ES', spanishRegions());
    render();

    expect(holidayState()).toBe('public-only');
    expect(screen.queryByRole('textbox')).toBeNull();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['None', 'Catalonia']);
    // Nobody should expect Semana Santa off the back of this.
    expect(note()).toContain('only public holidays');
    expect(note()).not.toMatch(/try again/i);
  });

  it("asks about the thing the country calls it, in the household's language", () => {
    state.responses.set('/api/timetables/holidays?country=DE', germanRegions());
    render(school(), 'de-DE');

    // A German noun keeps its capital; the dictionary here is the English one,
    // so only the word from the lookup follows the display language.
    expect(note()).toContain('Bundesland');
  });

  it('settles the casing the service cannot make up its mind about', () => {
    // "federal state" arrives in lower case and "Autonomous community"
    // capitalized. Both lead their sentence, so both are capitalized here.
    state.settings = { calendar: { holidayCountry: 'ES' } };
    state.responses.set('/api/timetables/holidays?country=ES', spanishRegions());
    render();
    expect(note().startsWith('Autonomous community: ')).toBe(true);
    cleanup();

    state.settings = { calendar: { holidayCountry: 'DE' } };
    state.responses.set('/api/timetables/holidays?country=DE', germanRegions());
    render();
    expect(note().startsWith('Federal state: ')).toBe(true);
  });

  it('falls back to a plain word when the lookup carries none', () => {
    state.responses.set('/api/timetables/holidays?country=DE', { ...germanRegions(), regionCategory: [] });
    render();

    expect(note()).toBe(
      "Region: Pick the one your school's holidays follow. Leave it at None and holidays are ignored.",
    );
  });

  it('offers the country itself where it publishes one set of dates and no regions', () => {
    // Belgium and Luxembourg have no regions at all, so their own code is the
    // one thing there is to pick rather than a code to be guessed at.
    state.settings = { calendar: { holidayCountry: 'LU' } };
    state.responses.set('/api/timetables/holidays?country=LU', {
      country: 'LU',
      subdivisions: [],
      regionCategory: [],
      hasSchoolHolidays: true,
      fetchedAt: '2026-09-01T00:00:00.000Z',
    });
    render();

    expect(holidayState()).toBe('list');
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', 'LU']);
    expect(select.options[1].textContent).toBe('Luxembourg');
  });

  it('asks for another try only when the lookup itself did not answer', () => {
    state.failing.add('/api/timetables/holidays?country=DE');
    render();

    expect(holidayState()).toBe('failed');
    expect(note()).toMatch(/try again/i);
  });

  it('says where to set a country when there is none to look up', () => {
    // No country for holidays, no saved location, and a bare language tag, so
    // nothing was ever asked: "try again later" cannot help here.
    state.settings = {};
    render(school(), 'de');

    expect(holidayState()).toBe('no-country');
    expect(state.asked.filter((url) => url.includes('country='))).toEqual([]);
    expect(note()).not.toMatch(/try again/i);
    expect(note()).not.toBe('');
  });

  it('gives each state its own sentence rather than one for all of them', () => {
    const notes = new Set<string>();
    for (const [settings, answer] of [
      // Nothing was ever asked, because no country could be worked out.
      [{}, null],
      // Asked, and the country has nothing published for it either way.
      [{ calendar: { holidayCountry: 'US' } }, noRegions('US')],
      // Asked, and the country has regions but no school dates.
      [{ calendar: { holidayCountry: 'ES' } }, spanishRegions()],
      // Asked, and the country has both.
      [{ calendar: { holidayCountry: 'DE' } }, germanRegions()],
    ] as const) {
      state.settings = settings as Record<string, unknown>;
      if (answer) state.responses.set(`/api/timetables/holidays?country=${answer.country}`, answer);
      render(school(), 'de');
      notes.add(note());
      cleanup();
    }
    state.failing.add('/api/timetables/holidays?country=DE');
    state.settings = { calendar: { holidayCountry: 'DE' } };
    render();
    notes.add(note());

    expect(notes.size).toBe(5);
    // The one sentence they all used to share belongs to the region lookup,
    // which is a different question from "what can this country be asked".
    for (const text of notes) {
      expect(text).not.toContain('We could not get the holiday dates for this region');
    }
  });
});

describe('working out where the household is', () => {
  beforeEach(() => {
    // A German household running the wall in English: the display language is
    // the wrong answer and must not be the one acted on.
    state.settings = { latitude: 51.2, longitude: 6.7 };
    state.responses.set('/api/timetables/holidays?country=DE', germanRegions());
  });

  it('waits for the location instead of looking the display language up', () => {
    const { rerender } = render();

    // Nothing about US, which is all the locale could have offered.
    expect(state.asked.filter((url) => url.includes('country='))).toEqual([]);
    expect(holidayState()).toBe('resolving');

    state.responses.set('/api/geocode?q=51.2%2C6.7', { countryCode: 'DE', subdivisionCode: 'DE-NW' });
    rerender(<Live initial={school()} />);

    expect(state.asked.filter((url) => url.includes('country='))).toEqual(['/api/timetables/holidays?country=DE']);
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('falls back to the display language once the location has answered nothing', () => {
    state.failing.add('/api/geocode?q=51.2%2C6.7');
    state.responses.set('/api/timetables/holidays?country=US', noRegions('US'));
    render();

    expect(state.asked.filter((url) => url.includes('country='))).toEqual(['/api/timetables/holidays?country=US']);
  });

  it('asks where the household is once a session, not once a school', () => {
    state.responses.set('/api/geocode?q=51.2%2C6.7', { countryCode: 'DE', subdivisionCode: 'DE-NW' });
    render();
    cleanup();
    render();
    cleanup();
    render();

    expect(state.asked.filter((url) => url.includes('/api/geocode'))).toEqual(['/api/geocode?q=51.2%2C6.7']);
    // And the row is right from the first render of the later schools.
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('offers the state the location resolves to as the example to type', () => {
    state.failing.add('/api/timetables/holidays?country=DE');
    state.responses.set('/api/geocode?q=51.2%2C6.7', { countryCode: 'DE', subdivisionCode: 'DE-NW' });
    render();

    expect((screen.getByRole('textbox') as HTMLInputElement).placeholder)
      .toBe('Region code, for example DE-NW');
  });
});
