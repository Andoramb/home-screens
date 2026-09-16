import type { SavedMeal, PlannedMeal, MealSettings, TimeFormat } from '@/types/config';
import { normalizeMealSettings } from '@/lib/meal-constants';
import { mealWriteBody, type MealDataWrite } from '@/lib/meal-write';
import { mealsDataUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { displayCache } from '@/lib/display-cache';

/**
 * The transport contract of `/api/meals/data`, shared by the phone's Meals
 * tab and the editor's meal-planner modal. The two surfaces keep their own
 * state and markup; what they must agree on is what a loaded copy is, how a
 * save quotes the revision it was built from, and what happens when the hub
 * says somebody else saved first.
 */

/** `editorFetch` on the editor and phone; the wall never writes meals. */
export type MealFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** What one GET (or one accepted save) answered with. */
export interface MealSnapshot {
  savedMeals: SavedMeal[];
  plan: PlannedMeal[];
  groceryChecked: string[];
  settings: MealSettings;
  globalTimeFormat: TimeFormat;
  /** Quoted back on every save of `savedMeals` or `plan`. */
  revision: string;
}

/**
 * One edit, as a function of the copy it is applied to.
 *
 * A save may have to run this twice: once against the copy the surface has,
 * and again against the hub's newer copy when the first attempt comes back as
 * a conflict. Written this way, a slot assignment made from an hours-old plan
 * lands on top of the other phone's additions instead of replacing them. Hand
 * back the array it was given (identity) for a half that did not change.
 */
export type MealEdit = (current: Pick<MealSnapshot, 'savedMeals' | 'plan'>) => MealDataWrite;

export type MealClientFailure = 'load' | 'save' | 'conflict';

export class MealClientError extends Error {
  constructor(readonly kind: MealClientFailure, message: string) {
    super(message);
    this.name = 'MealClientError';
  }
}

/** How many times a save re-applies its edit to the hub's newer copy before giving up. */
export const MAX_CONFLICT_RETRIES = 3;

const TTL_MS = FETCH_KEY_REGISTRY['meal-planner'].ttlMs;

function asSnapshot(json: unknown, fallbackTimeFormat: TimeFormat): MealSnapshot | null {
  const d = json as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return null;
  if (!Array.isArray(d.savedMeals) || !Array.isArray(d.plan) || typeof d.revision !== 'string' || !d.revision) return null;
  return {
    savedMeals: d.savedMeals as SavedMeal[],
    plan: d.plan as PlannedMeal[],
    groceryChecked: Array.isArray(d.groceryChecked) ? (d.groceryChecked as string[]) : [],
    settings: normalizeMealSettings(d.settings),
    globalTimeFormat: d.globalTimeFormat === '24h' || d.globalTimeFormat === '12h' ? d.globalTimeFormat : fallbackTimeFormat,
    revision: d.revision,
  };
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

/** The route's own plain sentence when it wrote one, the caller's fallback otherwise. */
function refusalMessage(json: unknown, fallback: string): string {
  const error = (json as { error?: unknown } | null)?.error;
  return typeof error === 'string' && error ? error : fallback;
}

/**
 * Load the stored meals. Rejects on any non-success status or an unusable
 * body: a surface that treated an error body as an empty library went on to
 * replace the real one with the first meal it added.
 */
export async function loadMeals(fetcher: MealFetch): Promise<MealSnapshot> {
  const res = await fetcher(mealsDataUrl());
  const json = await readJson(res);
  const snapshot = res.ok ? asSnapshot(json, '12h') : null;
  if (!snapshot) throw new MealClientError('load', refusalMessage(json, 'The meals could not be loaded.'));
  return snapshot;
}

/** Only the halves the edit actually changed, or null when it changed nothing. */
function changedHalves(changes: MealDataWrite, current: Pick<MealSnapshot, 'savedMeals' | 'plan'>): MealDataWrite | null {
  const out: MealDataWrite = {};
  if (changes.savedMeals !== undefined && changes.savedMeals !== current.savedMeals) out.savedMeals = changes.savedMeals;
  if (changes.plan !== undefined && changes.plan !== current.plan) out.plan = changes.plan;
  return out.savedMeals || out.plan ? out : null;
}

/**
 * Apply one edit to `base` and save it, quoting `base.revision`.
 *
 * A conflict answer carries the hub's current copy; the edit is re-applied to
 * that and sent again, up to `MAX_CONFLICT_RETRIES` times. The accepted
 * response is the next snapshot, and it is handed to the display cache so a
 * canvas preview showing the same URL adopts it without a fetch. Transport
 * failures (including an expired session) propagate untouched.
 */
export async function saveMealEdit(fetcher: MealFetch, base: MealSnapshot, edit: MealEdit): Promise<MealSnapshot> {
  let current = base;
  for (let attempt = 0; ; attempt++) {
    const changes = changedHalves(edit(current), current);
    if (!changes) return current;
    const res = await fetcher(mealsDataUrl(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mealWriteBody(changes), revision: current.revision }),
    });
    const json = await readJson(res);
    if (res.status === 409 && (json as { reason?: unknown } | null)?.reason === 'revision') {
      const theirs = asSnapshot(json, current.globalTimeFormat);
      if (theirs && attempt < MAX_CONFLICT_RETRIES) {
        current = theirs;
        continue;
      }
      throw new MealClientError('conflict', refusalMessage(json, 'Somebody else changed the meals. Try again.'));
    }
    const saved = res.ok ? asSnapshot(json, current.globalTimeFormat) : null;
    if (!saved) throw new MealClientError('save', refusalMessage(json, 'The meals could not be saved.'));
    displayCache.replace(mealsDataUrl(), saved, TTL_MS);
    return saved;
  }
}

/**
 * One surface's copy of the meals and the saves made from it, in order.
 *
 * Two taps in a row must not race each other: sent together they would quote
 * the same revision and the second would always conflict. Saves queue, each
 * starting from the snapshot the previous one was answered with. `idle` tells
 * a surface whether the snapshot it just received is the last word or an
 * older save's, so it can keep its optimistic state until the queue drains.
 *
 * A save made before the first load has answered waits for it: a tap on a
 * slow hub must not be refused for having beaten the first GET, and the copy
 * that GET delivers is the right base for it. A later reload is not waited
 * for, and one answered after a save is not adopted over the save's answer.
 */
export class MealSession {
  private snapshot: MealSnapshot | null = null;
  private loading: Promise<MealSnapshot> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  /** Saves answered so far; a load that started before one is older than it. */
  private answered = 0;

  constructor(private readonly fetcher: MealFetch) {}

  /** The last copy the hub answered with, or null before the first load. */
  get current(): MealSnapshot | null {
    return this.snapshot;
  }

  get idle(): boolean {
    return this.pending === 0;
  }

  async load(): Promise<MealSnapshot> {
    const attempt = loadMeals(this.fetcher);
    this.loading = attempt;
    const answeredBefore = this.answered;
    try {
      const loaded = await attempt;
      // A save answered since this load started is newer than what it
      // delivers, whether or not that save is still counted as pending.
      if (this.answered === answeredBefore) this.snapshot = loaded;
      return this.snapshot ?? loaded;
    } finally {
      if (this.loading === attempt) this.loading = null;
    }
  }

  save(edit: MealEdit): Promise<MealSnapshot> {
    this.pending += 1;
    const run = this.tail.then(async () => {
      // Only the first load is worth waiting for: a later reload delivers
      // nothing newer than the save's own answer.
      if (!this.snapshot && this.loading) await this.loading.catch(() => undefined);
      if (!this.snapshot) throw new MealClientError('save', 'Reopen the meal planner and try again.');
      const saved = await saveMealEdit(this.fetcher, this.snapshot, edit);
      this.snapshot = saved;
      this.answered += 1;
      return saved;
    });
    this.tail = run.then(() => undefined, () => undefined);
    return run.finally(() => { this.pending -= 1; });
  }
}
