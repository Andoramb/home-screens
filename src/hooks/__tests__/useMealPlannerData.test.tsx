// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act, waitFor } from '@testing-library/react';
import type { ModuleInstance, SavedMeal, PlannedMeal } from '@/types/config';
import { useMealPlannerData } from '../useMealPlannerData';

/** Meals and plan entries only need enough shape for identity assertions here. */
const meals = (...ids: string[]) => ids.map((id) => ({ id })) as unknown as SavedMeal[];
const entries = (...ids: string[]) => ids.map((id) => ({ id })) as unknown as PlannedMeal[];

function makeModule(config: Record<string, unknown> = {}): ModuleInstance {
  return {
    id: 'mod-1',
    type: 'meal-planner',
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config,
  } as unknown as ModuleInstance;
}

const SERVER_PAYLOAD = {
  savedMeals: [{ id: 'meal-1', name: 'Tacos' }],
  plan: [{ id: 'plan-1', mealId: 'meal-1' }],
  settings: { slots: [] },
};

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => SERVER_PAYLOAD,
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetchOk());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useMealPlannerData', () => {
  it('loads meal data on mount', async () => {
    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );

    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));
    expect(result.current.mealData.plan).toHaveLength(1);
    expect(result.current.saveError).toBeNull();
  });

  /* ─── legacy field migration ─────────────────────
   * The fullscreen copy of this logic stripped only `slots` and
   * `weekStartDay`, so a module carrying legacy embedded `savedMeals` / `plan`
   * never had them cleared and the next editor save re-persisted exactly what
   * the server migration had harvested out.
   */
  it('strips all five legacy embedded fields, not just slots and weekStartDay', async () => {
    const set = vi.fn();
    renderHook(() =>
      useMealPlannerData({
        mod: makeModule({ savedMeals: [{ id: 'legacy' }], plan: [], previousPlan: [] }),
        set,
        showModal: false,
      }),
    );

    await waitFor(() => expect(set).toHaveBeenCalled());
    expect(set).toHaveBeenCalledWith({
      slots: undefined,
      weekStartDay: undefined,
      savedMeals: undefined,
      plan: undefined,
      previousPlan: undefined,
    });
  });

  it('strips legacy fields when only slots is present', async () => {
    const set = vi.fn();
    renderHook(() =>
      useMealPlannerData({ mod: makeModule({ slots: [] }), set, showModal: false }),
    );
    await waitFor(() => expect(set).toHaveBeenCalled());
  });

  it('does not touch the config when no legacy fields are present', async () => {
    const set = vi.fn();
    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule({ view: 'week' }), set, showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));
    expect(set).not.toHaveBeenCalled();
  });

  /* ─── write failures ─────────────────────
   * Previously a `catch {}` plus a bare `if (res.ok)` discarded every failure,
   * leaving the optimistic local state applied. The editor showed the edit as
   * saved while the server never received it, and the user lost it on reload.
   */
  it('rolls back optimistic state and surfaces an error when the PUT fails', async () => {
    const fetchMock = vi
      .fn()
      // initial GET
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      // failing PUT
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: meals('new', 'new-2') });
    });

    expect(result.current.saveError).not.toBeNull();
    // Rolled back to the server state, not left showing the rejected edit.
    expect(result.current.mealData.savedMeals).toEqual(SERVER_PAYLOAD.savedMeals);
  });

  it('rolls back and surfaces an error when the PUT throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: meals('new') });
    });

    expect(result.current.saveError).not.toBeNull();
    expect(result.current.mealData.savedMeals).toEqual(SERVER_PAYLOAD.savedMeals);
  });

  it('does not flash an error when the session expired (a login redirect is landing)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      // editorFetch turns a 401 into a thrown "Session expired" and redirects
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: meals('new') });
    });

    expect(result.current.saveError).toBeNull();
  });

  it('reconciles from the server response on a successful write', async () => {
    const reconciled = {
      savedMeals: [{ id: 'server-1' }],
      plan: [{ id: 'server-plan' }],
      settings: { slots: ['dinner'] },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => reconciled });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: meals('local') });
    });

    expect(result.current.mealData.savedMeals).toEqual(reconciled.savedMeals);
    expect(result.current.mealData.settings).toEqual(reconciled.settings);
    expect(result.current.saveError).toBeNull();
  });

  it('omits settings from the PUT body so a concurrent settings edit is not clobbered', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: meals('x') });
    });

    const putCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PUT');
    expect(putCall).toBeDefined();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('settings');
    expect(body).toHaveProperty('savedMeals');
  });

  /* ─── partial writes ─────────────────────
   * The panel used to PUT its whole `savedMeals` and `plan` on every change,
   * filled in from its own possibly-stale copy. A phone editing the plan while
   * this modal was open lost that edit to the modal's stale copy, and vice
   * versa. Only the half the modal actually changed goes on the wire now.
   */
  it('sends only the field the modal changed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ plan: entries('plan-2') });
    });

    const putCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PUT');
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('savedMeals');
    expect(body.plan).toEqual([{ id: 'plan-2' }]);
    // The panel still shows both halves — only the request is narrowed.
    expect(result.current.mealData.savedMeals).toEqual(SERVER_PAYLOAD.savedMeals);
  });

  it('keeps showing the untouched half while a partial write is in flight', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.savedMeals).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ savedMeals: meals('m-1', 'm-2') });
    });

    expect(result.current.mealData.plan).toEqual(SERVER_PAYLOAD.plan);
  });

  /* ─── the empty-overwrite guard ─────────────────────
   * The server refuses an empty savedMeals/plan against non-empty stored data
   * unless the caller confirms. A combined write slipped past that whenever
   * either half was non-empty; a partial write no longer does, so clearing the
   * last planned week has to say it meant it. Only a panel that loaded the
   * stored data first is allowed to: an empty array from a panel whose GET
   * failed is data it never had.
   */
  it('confirms a deliberate clear once the stored data has loaded', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(result.current.mealData.plan).toHaveLength(1));

    await act(async () => {
      await result.current.handleModalUpdate({ plan: [] });
    });

    const putCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PUT');
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.force).toBe(true);
  });

  it('does not confirm an empty write from a panel whose load failed', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => SERVER_PAYLOAD });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useMealPlannerData({ mod: makeModule(), set: vi.fn(), showModal: false }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await act(async () => {
      await result.current.handleModalUpdate({ plan: [] });
    });

    const putCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PUT');
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('force');
  });
});
