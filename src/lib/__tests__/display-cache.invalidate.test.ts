// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { displayCache } from '@/lib/display-cache';

/**
 * `invalidateWhere` drops cached and in-flight reads by any rule and tells
 * whatever shows each one to fetch it again; `refreshWhere` asks for a fresh
 * read but keeps each entry a reader takes on until the answer lands. The
 * telling is a window event, so this runs in a DOM, unlike the rest of the
 * cache suite.
 */

const LIST = '/api/backgrounds?directory=Favorites';
const VIDEO = '/api/backgrounds?media=videos&file=a.mp4';
const TOP = '/api/backgrounds';
const WEATHER = '/api/weather';

let told: unknown[];
const listen = (e: Event) => told.push((e as CustomEvent).detail);

function seed() {
  displayCache.set(LIST, ['a.jpg'], 60_000);
  displayCache.set(VIDEO, { url: '/v.mp4' }, 60_000);
  displayCache.set(TOP, ['b.jpg'], 60_000);
  displayCache.set(WEATHER, { temp: 20 }, 60_000);
}

beforeEach(() => {
  displayCache.clear();
  told = [];
  window.addEventListener('displaycache:invalidate', listen);
});

afterEach(() => {
  window.removeEventListener('displaycache:invalidate', listen);
  displayCache.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('displayCache.invalidateWhere', () => {
  it('drops only the entries the test accepts', () => {
    seed();

    displayCache.invalidateWhere((url) => url.startsWith('/api/backgrounds') && !url.includes('file='));

    expect(displayCache.peek(LIST)).toBeNull();
    expect(displayCache.peek(TOP)).toBeNull();
    expect(displayCache.peek(VIDEO)?.data).toEqual({ url: '/v.mp4' });
    expect(displayCache.peek(WEATHER)?.data).toEqual({ temp: 20 });
  });

  it('tells subscribers once for each URL it dropped, naming the URL', () => {
    seed();
    displayCache.invalidateWhere((url) => url === LIST || url === TOP);
    expect(told).toEqual([LIST, TOP]);
  });

  it('asks about every entry and changes nothing when the test accepts none', () => {
    seed();
    const test = vi.fn((_url: string) => false);

    displayCache.invalidateWhere(test);

    expect(test.mock.calls.map(([url]) => url)).toEqual([LIST, VIDEO, TOP, WEATHER]);
    expect(told).toEqual([]);
    expect(displayCache.peek(LIST)).not.toBeNull();
  });

  it('reaches reads still in flight, and tells once for a URL both cached and in flight', async () => {
    vi.useFakeTimers();
    const answers: ((res: unknown) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => answers.push(resolve))));
    displayCache.set(LIST, ['old.jpg'], 1_000);
    vi.advanceTimersByTime(1_001);
    const reads = [displayCache.prefetch(LIST, 60_000), displayCache.prefetch(TOP, 60_000)];
    expect(displayCache.getStats().inflight).toBe(2);

    displayCache.invalidateWhere((url) => url.startsWith('/api/backgrounds'));

    expect(told).toEqual([LIST, TOP]);
    expect(displayCache.getStats().inflight).toBe(0);
    for (const answer of answers) answer({ ok: true, text: async () => '["new.jpg"]' });
    await Promise.all(reads);
    // A read that was dropped while out does not fill the cache again.
    expect(displayCache.peek(LIST)).toBeNull();
    expect(displayCache.peek(TOP)).toBeNull();
  });

  it('is what invalidateByPrefix runs on', () => {
    seed();
    const where = vi.spyOn(displayCache, 'invalidateWhere');

    displayCache.invalidateByPrefix('/api/backgrounds');

    expect(where).toHaveBeenCalledTimes(1);
    expect(told).toEqual([LIST, VIDEO, TOP]);
    expect(displayCache.peek(WEATHER)).not.toBeNull();
    for (const url of [LIST, VIDEO, TOP]) expect(displayCache.peek(url)).toBeNull();
  });
});

describe('displayCache.refreshWhere', () => {
  /** URLs a reader takes a refresh on for; the rest go unanswered. */
  let reading: Set<string>;
  let asked: string[];
  const reader = (e: Event) => {
    const url = (e as CustomEvent<string>).detail;
    asked.push(url);
    if (reading.has(url)) e.preventDefault();
  };
  beforeEach(() => {
    reading = new Set();
    asked = [];
    window.addEventListener('displaycache:refresh', reader);
  });
  afterEach(() => window.removeEventListener('displaycache:refresh', reader));

  it('asks once per accepted URL, keeping an entry a reader took on and dropping one nobody did', () => {
    seed();
    reading.add(LIST);

    displayCache.refreshWhere((url) => url === LIST || url === TOP);

    expect(asked).toEqual([LIST, TOP]);
    // Kept until the reader's answer replaces it, so a failed read still shows as behind.
    expect(displayCache.peek(LIST)?.data).toEqual(['a.jpg']);
    // Nobody showing it: gone, so the next reader fetches instead of the old answer.
    expect(displayCache.peek(TOP)).toBeNull();
    expect(displayCache.peek(WEATHER)?.data).toEqual({ temp: 20 });
    // It never sends the invalidation that makes readers drop what they hold.
    expect(told).toEqual([]);
  });

  it('asks about nothing and drops nothing when the test accepts none', () => {
    seed();
    displayCache.refreshWhere(() => false);
    expect(asked).toEqual([]);
    for (const url of [LIST, VIDEO, TOP, WEATHER]) expect(displayCache.peek(url)).not.toBeNull();
  });
});
