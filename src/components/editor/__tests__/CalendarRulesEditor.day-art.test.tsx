// @vitest-environment jsdom

/**
 * Reproduction harness for the reported bug: with two day rules, the second
 * rule's picture picker showed the first rule's art and clicks would not
 * change it. Drives the real CalendarRulesEditor with a stateful parent,
 * exactly how the config section owns the rules list.
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
  stateRef?: { current: CalendarDayRule[] | undefined };
}) {
  const [dayRules, setDayRules] = useState<CalendarDayRule[] | undefined>(initial);
  if (stateRef) stateRef.current = dayRules;
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

const HALLOWEEN = '/starter-day-art/halloween.svg';

describe('two day rules with picture backgrounds', () => {
  afterEach(cleanup);

  it("the second rule's picker picks its own art, independent of the first", async () => {
    const { container } = render(
      <Harness
        initial={[
          { id: 'r1', match: { dayOfMonth: 31, months: [9] }, backgroundImage: HALLOWEEN },
          { id: 'r2', match: {} },
        ]}
      />,
    );
    const cards = container.querySelectorAll('[data-rule-card]');
    expect(cards).toHaveLength(2);
    const card2 = cards[1];

    // Card 2: Background -> Picture. In an empty-match card the selects run
    // Which days, Events on day, Background. The Background one is last.
    const selects = card2.querySelectorAll('select');
    await act(async () => {
      fireEvent.change(selects[selects.length - 1], { target: { value: 'picture' } });
    });
    const picker = card2.querySelector('[data-day-art-picker]');
    expect(picker, 'picture picker rendered in card 2').toBeTruthy();

    // Card 1 shows halloween pressed; card 2 must not (it seeded celebrate).
    expect(cards[0].querySelector('[data-art-option="halloween"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(picker!.querySelector('[data-art-option="halloween"]')?.getAttribute('aria-pressed')).toBe('false');

    // Pick birthday on card 2.
    await act(async () => {
      fireEvent.click(picker!.querySelector('[data-art-option="birthday"]')!);
    });

    // Card 2 now shows birthday pressed and halloween not; card 1 unchanged.
    expect(card2.querySelector('[data-art-option="birthday"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(card2.querySelector('[data-art-option="halloween"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(cards[0].querySelector('[data-art-option="halloween"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(cards[0].querySelector('[data-art-option="birthday"]')?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('picture mode owns the whole background choice', () => {
  afterEach(cleanup);

  const backgroundSelect = (card: Element) => {
    const selects = card.querySelectorAll('select');
    return selects[selects.length - 1];
  };

  it('entering picture mode clears a plain color and the art carries the look alone', async () => {
    const stateRef: { current: CalendarDayRule[] | undefined } = { current: undefined };
    const { container } = render(
      <Harness initial={[{ id: 'r1', match: {}, background: '#ff0000' }]} stateRef={stateRef} />,
    );
    const card = container.querySelector('[data-rule-card]')!;
    await act(async () => {
      fireEvent.change(backgroundSelect(card), { target: { value: 'picture' } });
    });
    expect(stateRef.current?.[0].background).toBeUndefined();
    expect(stateRef.current?.[0].backgroundImage).toBe('/starter-day-art/celebrate.svg');
  });
});
