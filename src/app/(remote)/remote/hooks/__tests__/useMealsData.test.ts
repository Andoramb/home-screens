// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const translate = (key: string) => key;
vi.mock('@/i18n', () => ({ useTranslate: () => translate }));

import { useMealsData } from '../useMealsData';

const THIS_WEEK = '2026-09-27';
const NEXT_WEEK = '2026-10-04';

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });

const STORED = {
  savedMeals: [],
  plan: [],
  groceryChecked: { [THIS_WEEK]: ['tortillas'] },
  settings: {},
  globalTimeFormat: '12h',
  revision: 'rev-1',
};

function posted(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/meals/grocery')
    .map(([, opts]) => JSON.parse((opts as RequestInit).body as string));
}

async function loaded(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  const view = renderHook(() => useMealsData());
  await act(async () => { await view.result.current.fetchData(); });
  return view;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useMealsData grocery ticks', () => {
  it('ticks on the week it is given and leaves the other weeks alone', async () => {
    // Tortillas ticked this week must still be wanted next week: the same
    // name is a fresh tick there, not an untick of this week's.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockResolvedValueOnce(ok({ week: NEXT_WEEK, groceryChecked: ['tortillas'], changed: true }));
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.toggleGroceryItem(NEXT_WEEK, 'Tortillas'); });

    expect(posted(fetchMock)).toEqual([{ item: 'Tortillas', direction: 'check', week: NEXT_WEEK }]);
    expect(result.current.groceryChecked).toEqual({ [THIS_WEEK]: ['tortillas'], [NEXT_WEEK]: ['tortillas'] });
  });

  it('unticks only on the week the tick was made on', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockResolvedValueOnce(ok({ week: THIS_WEEK, groceryChecked: [], changed: true }));
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.toggleGroceryItem(THIS_WEEK, 'Tortillas'); });

    expect(posted(fetchMock)[0].direction).toBe('uncheck');
    expect(result.current.groceryChecked).toEqual({});
  });

  it('does not let a poll started before a tick put the old ticks back', async () => {
    let answerPoll!: (value: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockImplementationOnce(() => new Promise((resolve) => { answerPoll = resolve; }))
      .mockResolvedValueOnce(ok({ week: NEXT_WEEK, groceryChecked: ['lettuce'], changed: true }));
    const { result } = await loaded(fetchMock);

    let poll!: Promise<void>;
    act(() => { poll = result.current.fetchData(); });
    await act(async () => { await result.current.toggleGroceryItem(NEXT_WEEK, 'Lettuce'); });
    await act(async () => {
      answerPoll(ok(STORED));
      await poll;
    });

    expect(result.current.groceryChecked).toEqual({ [THIS_WEEK]: ['tortillas'], [NEXT_WEEK]: ['lettuce'] });
  });

  it('shows the last tick\'s answer when two ticks overlap', async () => {
    let answerFirst!: (value: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve; }))
      .mockResolvedValueOnce(ok({ week: NEXT_WEEK, groceryChecked: ['lettuce', 'milk'], changed: true }));
    const { result } = await loaded(fetchMock);

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = result.current.toggleGroceryItem(NEXT_WEEK, 'Lettuce'); });
    act(() => { second = result.current.toggleGroceryItem(NEXT_WEEK, 'Milk'); });
    // The second tick waits for the first's answer.
    await vi.waitFor(() => expect(posted(fetchMock)).toHaveLength(1));
    await act(async () => {
      answerFirst(ok({ week: NEXT_WEEK, groceryChecked: ['lettuce'], changed: true }));
      await first;
      await second;
    });

    expect(posted(fetchMock).map((b) => b.item)).toEqual(['Lettuce', 'Milk']);
    expect(result.current.groceryChecked).toEqual({ [THIS_WEEK]: ['tortillas'], [NEXT_WEEK]: ['lettuce', 'milk'] });
  });

  it('puts a refused tick back and says so', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(STORED))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = await loaded(fetchMock);

    await act(async () => { await result.current.toggleGroceryItem(NEXT_WEEK, 'Lettuce'); });

    expect(result.current.groceryChecked).toEqual({ [THIS_WEEK]: ['tortillas'] });
    expect(result.current.saveError).toBe('mealsTab.saveFailed');
  });
});
