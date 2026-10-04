// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlannedMeal, SavedMeal } from '@/types/config';
import { displayCache } from '@/lib/display-cache';
import {
  loadMeals,
  saveMealEdit,
  saveGroceryCheck,
  MealSession,
  MealClientError,
  MAX_CONFLICT_RETRIES,
  type MealFetch,
  type MealSnapshot,
} from '../meal-client';

const meal = (id: string) => ({ id, name: id }) as SavedMeal;
const entry = (id: string) => ({ date: '2026-09-15', slot: 'dinner', mealId: id }) as PlannedMeal;

function payload(overrides: Partial<MealSnapshot> = {}) {
  return {
    savedMeals: [meal('m1')],
    plan: [entry('m1')],
    groceryChecked: {},
    settings: {},
    globalTimeFormat: '24h',
    revision: 'rev-1',
    ...overrides,
  };
}

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json }) as unknown as Response;
const status = (code: number, json: unknown) => ({ ok: false, status: code, json: async () => json }) as unknown as Response;

function bodyOf(call: unknown[]): Record<string, unknown> {
  return JSON.parse((call[1] as RequestInit).body as string);
}

beforeEach(() => {
  displayCache.clear();
});

describe('loadMeals', () => {
  it('returns the stored copy with its revision', async () => {
    const fetcher: MealFetch = vi.fn().mockResolvedValue(ok(payload()));
    const snapshot = await loadMeals(fetcher);
    expect(snapshot.revision).toBe('rev-1');
    expect(snapshot.globalTimeFormat).toBe('24h');
    expect(snapshot.settings.enabledSlots).toBeDefined();
  });

  /* An error body is not an empty library. */
  it('rejects a non-success status even when the body parses', async () => {
    const fetcher: MealFetch = vi.fn().mockResolvedValue(status(500, { error: 'Cannot read meals' }));
    await expect(loadMeals(fetcher)).rejects.toThrow('Cannot read meals');
  });

  it('rejects a success whose body is not a meal document', async () => {
    const fetcher: MealFetch = vi.fn().mockResolvedValue(ok({ error: 'nope' }));
    await expect(loadMeals(fetcher)).rejects.toBeInstanceOf(MealClientError);
  });

  it('rejects a success that carries no revision to quote back', async () => {
    const fetcher: MealFetch = vi.fn().mockResolvedValue(ok({ ...payload(), revision: undefined }));
    await expect(loadMeals(fetcher)).rejects.toBeInstanceOf(MealClientError);
  });
});

describe('grocery ticks in a snapshot', () => {
  it('keeps each week\'s ticks apart', async () => {
    const fetcher: MealFetch = vi.fn().mockResolvedValue(ok(payload({
      groceryChecked: { '2026-09-27': ['tortillas'], '2026-10-04': ['lettuce'] },
    })));
    const snapshot = await loadMeals(fetcher);
    expect(snapshot.groceryChecked).toEqual({ '2026-09-27': ['tortillas'], '2026-10-04': ['lettuce'] });
  });

  it('reads a single all-weeks list as nothing ticked', async () => {
    const fetcher: MealFetch = vi.fn().mockResolvedValue(ok({ ...payload(), groceryChecked: ['tortillas'] }));
    expect((await loadMeals(fetcher)).groceryChecked).toEqual({});
  });
});

describe('saveGroceryCheck', () => {
  it('posts the tick with its week and direction and answers that week\'s ticks', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok({ week: '2026-10-04', groceryChecked: ['lettuce'], changed: true }));

    const answer = await saveGroceryCheck(fetcher, '2026-10-04', 'Lettuce', 'check');

    expect(fetcher.mock.calls[0][0]).toBe('/api/meals/grocery');
    expect(bodyOf(fetcher.mock.calls[0])).toEqual({ item: 'Lettuce', direction: 'check', week: '2026-10-04' });
    expect(answer).toEqual({ week: '2026-10-04', checked: ['lettuce'] });
  });

  it('rejects a refusal with the route\'s own sentence', async () => {
    const fetcher = vi.fn().mockResolvedValue(status(400, { error: 'week must be a date like 2026-09-27 when provided' }));
    await expect(saveGroceryCheck(fetcher, 'soon', 'milk', 'check')).rejects.toThrow(/week must be a date/);
  });

  it('lets a transport failure through untouched', async () => {
    const failure = new Error('expired');
    const fetcher = vi.fn().mockRejectedValue(failure);
    await expect(saveGroceryCheck(fetcher, '2026-10-04', 'milk', 'check')).rejects.toBe(failure);
  });
});

describe('saveMealEdit', () => {
  it('quotes the base revision and sends only the half the edit changed', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok(payload({ revision: 'rev-2' })));
    const base = await loadMeals(vi.fn().mockResolvedValue(ok(payload())));

    const saved = await saveMealEdit(fetcher, base, (c) => ({ plan: [...c.plan, entry('m2')], savedMeals: c.savedMeals }));

    const body = bodyOf(fetcher.mock.calls[0]);
    expect(body.revision).toBe('rev-1');
    expect(body.plan).toHaveLength(2);
    expect(body).not.toHaveProperty('savedMeals');
    expect(saved.revision).toBe('rev-2');
  });

  it('sends nothing when the edit changed nothing', async () => {
    const fetcher = vi.fn();
    const base = await loadMeals(vi.fn().mockResolvedValue(ok(payload())));
    const saved = await saveMealEdit(fetcher, base, (c) => ({ plan: c.plan }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(saved).toBe(base);
  });

  it('confirms a clear', async () => {
    const fetcher = vi.fn().mockResolvedValue(ok(payload({ plan: [], revision: 'rev-2' })));
    const base = await loadMeals(vi.fn().mockResolvedValue(ok(payload())));
    await saveMealEdit(fetcher, base, () => ({ plan: [] }));
    expect(bodyOf(fetcher.mock.calls[0]).force).toBe(true);
  });

  /* Two phones loaded [m1]. The other saved [m1, theirs] first; this one's
   * [m1, mine] must land as [m1, theirs, mine], not replace theirs. */
  it('re-applies the edit to the hub copy on a revision conflict', async () => {
    const theirs = payload({ plan: [entry('m1'), entry('theirs')], revision: 'rev-2' });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(status(409, { reason: 'revision', error: 'Somebody else changed the meals.', ...theirs }))
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        return ok(payload({ plan: body.plan, revision: 'rev-3' }));
      });
    const base = await loadMeals(vi.fn().mockResolvedValue(ok(payload())));

    const saved = await saveMealEdit(fetcher, base, (c) => ({ plan: [...c.plan, entry('mine')] }));

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(bodyOf(fetcher.mock.calls[1]).revision).toBe('rev-2');
    expect(saved.plan.map((p) => p.mealId)).toEqual(['m1', 'theirs', 'mine']);
    expect(saved.revision).toBe('rev-3');
  });

  it('gives up after the retry budget rather than looping', async () => {
    const fetcher = vi.fn().mockImplementation(async () =>
      status(409, { reason: 'revision', error: 'Somebody else changed the meals.', ...payload({ revision: `rev-${Math.random()}` }) }),
    );
    const base = await loadMeals(vi.fn().mockResolvedValue(ok(payload())));

    await expect(saveMealEdit(fetcher, base, (c) => ({ plan: [...c.plan, entry('mine')] })))
      .rejects.toMatchObject({ kind: 'conflict' });
    expect(fetcher).toHaveBeenCalledTimes(MAX_CONFLICT_RETRIES + 1);
  });

  /* The empty-overwrite guard also answers 409; adopting its body as "theirs"
   * would discard the edit to explain a race that never happened. */
  it('treats a 409 without reason: revision as a plain refusal', async () => {
    const fetcher = vi.fn().mockResolvedValue(status(409, { error: 'Refusing to overwrite non-empty meal data.' }));
    const base = await loadMeals(vi.fn().mockResolvedValue(ok(payload())));
    await expect(saveMealEdit(fetcher, base, () => ({ plan: [entry('x')] })))
      .rejects.toMatchObject({ kind: 'save', message: 'Refusing to overwrite non-empty meal data.' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('lets a transport failure through untouched so an expired session is still recognised', async () => {
    const expired = new Error('Session expired');
    const fetcher = vi.fn().mockRejectedValue(expired);
    const base = await loadMeals(vi.fn().mockResolvedValue(ok(payload())));
    await expect(saveMealEdit(fetcher, base, () => ({ plan: [entry('x')] }))).rejects.toBe(expired);
  });

  it('hands the accepted copy to the display cache', async () => {
    const answer = payload({ revision: 'rev-2' });
    const fetcher = vi.fn().mockResolvedValue(ok(answer));
    const base = await loadMeals(vi.fn().mockResolvedValue(ok(payload())));
    await saveMealEdit(fetcher, base, () => ({ plan: [entry('x')] }));
    expect(displayCache.get<MealSnapshot>('/api/meals/data')?.data.revision).toBe('rev-2');
  });
});

describe('MealSession', () => {
  it('refuses to save before anything has loaded', async () => {
    const fetcher = vi.fn();
    const session = new MealSession(fetcher);
    await expect(session.save(() => ({ plan: [entry('x')] }))).rejects.toBeInstanceOf(MealClientError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  /* Two taps in a row must not quote the same revision: the second would
   * always conflict and cost a round trip. */
  it('runs saves in order, each from the copy the previous one was answered with', async () => {
    let revision = 1;
    const fetcher = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init) return ok(payload({ revision: 'rev-1' }));
      const body = JSON.parse(init.body as string);
      revision += 1;
      return ok(payload({ plan: body.plan, revision: `rev-${revision}` }));
    });
    const session = new MealSession(fetcher);
    await session.load();

    const first = session.save((c) => ({ plan: [...c.plan, entry('a')] }));
    expect(session.idle).toBe(false);
    const second = session.save((c) => ({ plan: [...c.plan, entry('b')] }));
    const [, last] = await Promise.all([first, second]);

    const puts = fetcher.mock.calls.filter(([, init]) => init).map(bodyOf);
    expect(puts.map((b) => b.revision)).toEqual(['rev-1', 'rev-2']);
    expect(last.plan.map((p) => p.mealId)).toEqual(['m1', 'a', 'b']);
    expect(session.idle).toBe(true);
    expect(session.current).toBe(last);
  });

  /* A tap that beats the first GET on a slow hub is not an error. */
  it('holds a save made during the first load and applies it to what the load delivers', async () => {
    let answerLoad!: (value: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { answerLoad = resolve; }))
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        return ok(payload({ plan: body.plan, revision: 'rev-2' }));
      });
    const session = new MealSession(fetcher);
    const load = session.load();
    const save = session.save((c) => ({ plan: [...c.plan, entry('mine')] }));
    expect(fetcher).toHaveBeenCalledTimes(1);

    answerLoad(ok(payload({ plan: [entry('m1'), entry('theirs')] })));
    await load;
    const saved = await save;

    expect(bodyOf(fetcher.mock.calls[1]).revision).toBe('rev-1');
    expect(saved.plan.map((p) => p.mealId)).toEqual(['m1', 'theirs', 'mine']);
    expect(session.current).toBe(saved);
  });

  /* A reload (the modal opening, the tab becoming visible) answered after a
   * save it overlapped with carries the pre-save copy. */
  it('does not let a load answered after a save replace what the save was answered with', async () => {
    let answerLoad!: (value: Response) => void;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok(payload()))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { answerLoad = resolve; }))
      .mockResolvedValueOnce(ok(payload({ plan: [entry('m1'), entry('saved')], revision: 'rev-2' })));
    const session = new MealSession(fetcher);
    await session.load();

    const reload = session.load();
    await session.save((c) => ({ plan: [...c.plan, entry('saved')] }));
    expect(session.idle).toBe(true);
    answerLoad(ok(payload()));
    const delivered = await reload;

    expect(delivered.revision).toBe('rev-2');
    expect(session.current?.revision).toBe('rev-2');
  });

  it('refuses a save whose load failed', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(status(500, { error: 'Cannot read meals' }));
    const session = new MealSession(fetcher);
    const load = session.load().catch(() => undefined);
    await expect(session.save(() => ({ plan: [entry('x')] }))).rejects.toBeInstanceOf(MealClientError);
    await load;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  /* ─── grocery ticks ─────────────────────
   * Ticks used to go around the session: two quick ticks answered out of
   * order left the older answer on screen, a reload started before a tick
   * put the old ticks back, and a save that changed nothing handed back a
   * copy without the tick. */
  const tickAnswer = (week: string, checked: string[]) => ok({ week, groceryChecked: checked, changed: true });
  const isTick = (url: unknown) => url === '/api/meals/grocery';

  it('sends ticks one at a time, in the order they were made', async () => {
    let answerFirst!: (value: Response) => void;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok(payload()))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { answerFirst = resolve; }))
      .mockResolvedValueOnce(tickAnswer('2026-09-27', ['milk', 'eggs']));
    const session = new MealSession(fetcher);
    await session.load();

    const first = session.tick('2026-09-27', 'milk', 'check');
    const second = session.tick('2026-09-27', 'eggs', 'check');
    await Promise.resolve();
    // The second waits for the first's answer, so it can never land first.
    expect(fetcher.mock.calls.filter(([url]) => isTick(url))).toHaveLength(1);
    expect(session.idle).toBe(false);

    answerFirst(tickAnswer('2026-09-27', ['milk']));
    await first;
    expect(session.idle).toBe(false);
    const last = await second;

    expect(fetcher.mock.calls.filter(([url]) => isTick(url)).map(bodyOf).map((b) => b.item)).toEqual(['milk', 'eggs']);
    expect(last.groceryChecked).toEqual({ '2026-09-27': ['milk', 'eggs'] });
    expect(session.current).toBe(last);
    expect(session.idle).toBe(true);
  });

  it('does not let a load started before a tick put the old ticks back', async () => {
    let answerLoad!: (value: Response) => void;
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok(payload()))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { answerLoad = resolve; }))
      .mockResolvedValueOnce(tickAnswer('2026-09-27', ['milk']));
    const session = new MealSession(fetcher);
    await session.load();

    const reload = session.load();
    await session.tick('2026-09-27', 'milk', 'check');
    answerLoad(ok(payload()));
    const delivered = await reload;

    expect(delivered.groceryChecked).toEqual({ '2026-09-27': ['milk'] });
    expect(session.current?.groceryChecked).toEqual({ '2026-09-27': ['milk'] });
  });

  it('keeps a tick through a save that changed nothing', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok(payload()))
      .mockResolvedValueOnce(tickAnswer('2026-09-27', ['milk']));
    const session = new MealSession(fetcher);
    await session.load();
    await session.tick('2026-09-27', 'milk', 'check');

    const unchanged = await session.save((c) => ({ plan: c.plan }));

    expect(unchanged.groceryChecked).toEqual({ '2026-09-27': ['milk'] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the other weeks and the meals when a tick is answered', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok(payload({ groceryChecked: { '2026-09-27': ['milk'] } })))
      .mockResolvedValueOnce(tickAnswer('2026-10-04', ['lettuce']));
    const session = new MealSession(fetcher);
    const loaded = await session.load();

    const ticked = await session.tick('2026-10-04', 'Lettuce', 'check');

    expect(bodyOf(fetcher.mock.calls[1])).toEqual({ item: 'Lettuce', direction: 'check', week: '2026-10-04' });
    expect(ticked.groceryChecked).toEqual({ '2026-09-27': ['milk'], '2026-10-04': ['lettuce'] });
    expect(ticked.plan).toBe(loaded.plan);
    expect(ticked.revision).toBe(loaded.revision);
  });

  it('refuses a tick before anything has loaded and keeps going after a refused one', async () => {
    const empty = new MealSession(vi.fn());
    await expect(empty.tick('2026-09-27', 'milk', 'check')).rejects.toBeInstanceOf(MealClientError);

    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok(payload()))
      .mockResolvedValueOnce(status(500, { error: 'boom' }))
      .mockResolvedValueOnce(tickAnswer('2026-09-27', ['eggs']));
    const session = new MealSession(fetcher);
    await session.load();
    await expect(session.tick('2026-09-27', 'milk', 'check')).rejects.toBeInstanceOf(MealClientError);
    await expect(session.tick('2026-09-27', 'eggs', 'check')).resolves.toMatchObject({ groceryChecked: { '2026-09-27': ['eggs'] } });
    expect(session.idle).toBe(true);
  });

  it('keeps going after a failed save', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok(payload()))
      .mockResolvedValueOnce(status(500, { error: 'boom' }))
      .mockResolvedValueOnce(ok(payload({ revision: 'rev-2' })));
    const session = new MealSession(fetcher);
    await session.load();
    await expect(session.save(() => ({ plan: [entry('x')] }))).rejects.toBeInstanceOf(MealClientError);
    await expect(session.save(() => ({ plan: [entry('y')] }))).resolves.toMatchObject({ revision: 'rev-2' });
  });
});
