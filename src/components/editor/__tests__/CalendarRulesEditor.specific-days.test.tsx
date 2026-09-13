// @vitest-environment jsdom

/**
 * The Specific days choice owns the whole date question, so the plain
 * Days-of-week button row hides under it, and entering it clears any picked
 * weekdays, so the dropdown stays one clean choice, like it already does for
 * `when`. (The engine still AND-combines hand-edited configs; this is
 * editor-only behavior.)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { useState } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { CalendarRulesEditor } from '../config-sections/CalendarRulesEditor';
import type { CalendarDayRule } from '@/types/config';

vi.mock('@/lib/editor-fetch', () => ({
  editorFetch: vi.fn(async () => ({ ok: true, json: async () => [] })),
}));

function Harness({ initial, stateRef }: {
  initial: CalendarDayRule[];
  stateRef: { current: CalendarDayRule[] | undefined };
}) {
  const [dayRules, setDayRules] = useState<CalendarDayRule[] | undefined>(initial);
  stateRef.current = dayRules;
  return (
    <I18nProvider locale="en-US" blob={{}}>
      <CalendarRulesEditor
        eventRules={undefined}
        dayRules={dayRules}
        availableSources={[]}
        onChange={(p) => setDayRules(p.dayRules)}
      />
    </I18nProvider>
  );
}

/** The weekday row's buttons are the only aria-pressed buttons in a plain
 *  (non-picture) day-rule card, so counting them spots the row reliably. */
const weekdayButtons = (card: Element) => Array.from(card.querySelectorAll('button[aria-pressed]'));

describe('specific days and the weekday row', () => {
  afterEach(cleanup);

  it('hides the weekday row under Specific days and clears picks on entry', async () => {
    const stateRef: { current: CalendarDayRule[] | undefined } = { current: undefined };
    const { container } = render(
      <Harness initial={[{ id: 'r1', match: { daysOfWeek: [5] } }]} stateRef={stateRef} />,
    );
    const card = container.querySelector('[data-rule-card]')!;

    // Friday is picked and visible before the switch.
    expect(weekdayButtons(card)).toHaveLength(7);
    expect(weekdayButtons(card)[5].getAttribute('aria-pressed')).toBe('true');

    // Which days (the first select) -> Specific days.
    await act(async () => {
      fireEvent.change(card.querySelectorAll('select')[0], { target: { value: 'specific' } });
    });

    // The row is gone and the match carries the seeded pattern only:
    // when and daysOfWeek cleared, dayOfMonth seeded.
    expect(weekdayButtons(card)).toHaveLength(0);
    expect(stateRef.current?.[0].match).toEqual({ dayOfMonth: 1 });

    // Switching back re-shows the row, still unpicked.
    await act(async () => {
      fireEvent.change(card.querySelectorAll('select')[0], { target: { value: 'any' } });
    });
    expect(weekdayButtons(card)).toHaveLength(7);
    expect(weekdayButtons(card).every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(stateRef.current?.[0].match).toEqual({});
  });
});
