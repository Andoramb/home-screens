// @vitest-environment jsdom

/**
 * Rule cards render collapsed so the lists read as lists, and each carries
 * an optional name ("Halloween") unique within its list. These tests pin
 * the collapse behavior and the pencil rename: commit semantics, the
 * Rule {n} fallback, and the duplicate refusal.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { I18nProvider } from '@/i18n/provider';
import enUSEditor from '@/translations/en-US/editor.json';
import { CalendarRulesEditor } from '../config-sections/CalendarRulesEditor';
import type { CalendarDayRule, CalendarEventRule } from '@/types/config';

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(async () => ({ ok: true, json: async () => [] })),
}));

function Harness({ initialDays, initialEvents, daysRef, eventsRef }: {
  initialDays: CalendarDayRule[];
  initialEvents?: CalendarEventRule[];
  daysRef: { current: CalendarDayRule[] | undefined };
  eventsRef?: { current: CalendarEventRule[] | undefined };
}) {
  const [dayRules, setDayRules] = useState<CalendarDayRule[] | undefined>(initialDays);
  const [eventRules, setEventRules] = useState<CalendarEventRule[] | undefined>(initialEvents);
  daysRef.current = dayRules;
  if (eventsRef) eventsRef.current = eventRules;
  return (
    <I18nProvider locale="en-US" blob={{ editor: enUSEditor }}>
      <CalendarRulesEditor
        eventRules={eventRules}
        dayRules={dayRules}
        availableSources={[]}
        onChange={(p) => {
          if ('dayRules' in p) setDayRules(p.dayRules);
          if ('eventRules' in p) setEventRules(p.eventRules);
        }}
      />
    </I18nProvider>
  );
}

const dayCard = (container: HTMLElement, i = 0) =>
  container.querySelectorAll('[data-rules-list="days"] [data-rule-card]')[i];
const expand = async (card: Element) => {
  await act(async () => {
    fireEvent.click(card.querySelector('[data-rule-toggle]')!);
  });
};
const headerName = (card: Element) => card.querySelector('[data-rule-name]')?.textContent;
const rename = async (card: Element, value: string, key: 'Enter' | 'Escape' = 'Enter') => {
  await act(async () => {
    fireEvent.click(card.querySelector('button[aria-label="Rename rule"]')!);
  });
  const input = card.querySelector('[data-rule-name-editor] input') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
  await act(async () => {
    fireEvent.keyDown(input, { key });
  });
};

describe('rule cards collapse one at a time', () => {
  afterEach(cleanup);

  it('rules render collapsed with names (or Rule N) as the header', () => {
    const daysRef = { current: undefined as CalendarDayRule[] | undefined };
    const { container } = render(
      <Harness
        initialDays={[
          { id: 'r1', match: {}, name: 'Halloween' },
          { id: 'r2', match: {} },
        ]}
        daysRef={daysRef}
      />,
    );
    expect(headerName(dayCard(container, 0))).toBe('Halloween');
    expect(headerName(dayCard(container, 1))).toBe('Rule 2');
    // Collapsed: the header shows, the form does not.
    expect(dayCard(container, 0).querySelectorAll('select')).toHaveLength(0);
  });

  it('the header toggle expands one rule without the others', async () => {
    const daysRef = { current: undefined as CalendarDayRule[] | undefined };
    const { container } = render(
      <Harness initialDays={[{ id: 'r1', match: {} }, { id: 'r2', match: {} }]} daysRef={daysRef} />,
    );
    await expand(dayCard(container, 1));
    expect(dayCard(container, 1).querySelectorAll('select').length).toBeGreaterThan(0);
    expect(dayCard(container, 0).querySelectorAll('select')).toHaveLength(0);
    expect(dayCard(container, 1).querySelector('[data-rule-toggle]')!.getAttribute('aria-expanded')).toBe('true');
    expect(dayCard(container, 0).querySelector('[data-rule-toggle]')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('a freshly added rule arrives expanded', async () => {
    const daysRef = { current: undefined as CalendarDayRule[] | undefined };
    const { container } = render(<Harness initialDays={[]} daysRef={daysRef} />);
    // The Add button is the list's only direct <button> child (cards are divs).
    await act(async () => {
      fireEvent.click(container.querySelector('[data-rules-list="days"] > button')!);
    });
    const card = dayCard(container, 0);
    expect(card.querySelectorAll('select').length).toBeGreaterThan(0);
    expect(headerName(card)).toBe('Rule 1');
  });
});

describe('rule names', () => {
  afterEach(cleanup);

  it('the pencil commits a trimmed name and an empty commit clears it', async () => {
    const daysRef = { current: undefined as CalendarDayRule[] | undefined };
    const { container } = render(<Harness initialDays={[{ id: 'r1', match: {} }]} daysRef={daysRef} />);
    const card = dayCard(container);

    await rename(card, '  Trash day  ');
    expect(daysRef.current?.[0].name).toBe('Trash day');
    expect(headerName(card)).toBe('Trash day');

    await rename(card, '   ');
    expect(daysRef.current?.[0].name).toBeUndefined();
    expect(headerName(card)).toBe('Rule 1');
  });

  it('a name another rule in the list already carries is refused, ignoring case and spacing', async () => {
    const daysRef = { current: undefined as CalendarDayRule[] | undefined };
    const { container } = render(
      <Harness
        initialDays={[
          { id: 'r1', match: {}, name: 'Halloween' },
          { id: 'r2', match: {} },
        ]}
        daysRef={daysRef}
      />,
    );
    await rename(dayCard(container, 1), ' hALLOWEEN ');
    const card2 = dayCard(container, 1);
    expect(card2.querySelector('[data-rule-name-taken]')?.textContent).toBeTruthy();
    expect(daysRef.current?.[1].name).toBeUndefined();
  });

  it('renaming to a name it already holds itself is allowed', async () => {
    const daysRef = { current: undefined as CalendarDayRule[] | undefined };
    const { container } = render(
      <Harness initialDays={[{ id: 'r1', match: {}, name: 'Halloween' }]} daysRef={daysRef} />,
    );
    await rename(dayCard(container), '  halloween  ');
    // Committed with the new spacing/case, not refused as its own duplicate.
    expect(daysRef.current?.[0].name).toBe('halloween');
    expect(dayCard(container).querySelector('[data-rule-name-taken]')).toBeNull();
  });

  it('Escape cancels without writing', async () => {
    const daysRef = { current: undefined as CalendarDayRule[] | undefined };
    const { container } = render(
      <Harness initialDays={[{ id: 'r1', match: {}, name: 'Halloween' }]} daysRef={daysRef} />,
    );
    await rename(dayCard(container), 'Something else', 'Escape');
    expect(daysRef.current?.[0].name).toBe('Halloween');
    expect(headerName(dayCard(container))).toBe('Halloween');
  });

  it('the same name may exist in the event list and the day list', async () => {
    const daysRef = { current: undefined as CalendarDayRule[] | undefined };
    const eventsRef = { current: undefined as CalendarEventRule[] | undefined };
    const { container } = render(
      <Harness
        initialDays={[{ id: 'd1', match: {} }]}
        initialEvents={[{ id: 'e1', match: {}, name: 'Halloween' }]}
        daysRef={daysRef}
        eventsRef={eventsRef}
      />,
    );
    await rename(dayCard(container), 'Halloween');
    expect(daysRef.current?.[0].name).toBe('Halloween');
    expect(eventsRef.current?.[0].name).toBe('Halloween');
    expect(dayCard(container).querySelector('[data-rule-name-taken]')).toBeNull();
  });
});
