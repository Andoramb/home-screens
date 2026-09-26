// @vitest-environment jsdom

/**
 * The command drain is the wall's one 3 s request to the hub. Its answer's
 * revisions go to the heartbeat readers, after the commands (which exist
 * nowhere else once drained). An editor preview reads the revisions alone,
 * and a refused beat still lets the wall notice a new build.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { subscribeRevisions, type DisplayRevisions } from '@/lib/display-heartbeat';
import type { CommandHandlers } from '../useDisplayCommands';

const REVISIONS: DisplayRevisions = { buildId: 'build-1', plugins: 'p1', config: '"c1"', timer: 't1' };

let beatStatus = 200;
// False plays a hub from before revisions existed, as after a rollback.
let answersRevisions = true;
let commands: unknown[] = [];
const fetched: string[] = [];

vi.mock('@/lib/display-fetch', () => ({
  displayFetch: vi.fn(async (url: string) => {
    fetched.push(url);
    if (url === '/api/system/build-id') return { ok: true, text: async () => 'build-2' };
    return {
      ok: beatStatus === 200,
      status: beatStatus,
      json: async () => (url.startsWith('/api/display/commands')
        ? { commands, sharedStateWatched: false, ...(answersRevisions ? { revisions: REVISIONS } : {}) }
        : { revisions: REVISIONS }),
    };
  }),
}));

import { useDisplayCommands } from '../useDisplayCommands';

const order: string[] = [];
const published: DisplayRevisions[] = [];
let unsubscribe: () => void = () => {};

function handlers(): CommandHandlers {
  return {
    wake: () => order.push('wake'),
    sleep: vi.fn(),
    nextScreen: vi.fn(),
    prevScreen: vi.fn(),
    gotoScreen: vi.fn(),
    sleepOverride: vi.fn(),
    setBrightness: vi.fn(),
    reload: vi.fn(),
    showAlert: vi.fn(),
    showPhoto: vi.fn(),
  };
}

async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  beatStatus = 200;
  answersRevisions = true;
  commands = [];
  fetched.length = 0;
  order.length = 0;
  published.length = 0;
  unsubscribe = subscribeRevisions((revisions) => {
    order.push('revisions');
    published.push(revisions);
  });
});

afterEach(() => {
  unsubscribe();
  cleanup();
  vi.useRealTimers();
});

describe('the display heartbeat', () => {
  it('drains this display, runs its commands, then hands on the revisions, every 3 s', async () => {
    commands = [{ type: 'wake', timestamp: 1 }];
    renderHook(() => useDisplayCommands(handlers(), 'kitchen'));
    await flush();

    expect(fetched).toEqual(['/api/display/commands?display=kitchen']);
    expect(order).toEqual(['wake', 'revisions']);
    expect(published).toEqual([REVISIONS]);

    commands = [];
    await flush(3_000);
    expect(fetched).toHaveLength(2);
    expect(published).toHaveLength(2);
  });

  it('in a preview, reads the revisions alone and runs no commands', async () => {
    commands = [{ type: 'wake', timestamp: 1 }];
    renderHook(() => useDisplayCommands(handlers(), 'kitchen', false));
    await flush();

    expect(fetched).toEqual(['/api/display/revisions']);
    expect(order).toEqual(['revisions']);
  });

  it('after a refused beat, hands on the build id from the public endpoint alone', async () => {
    beatStatus = 401;
    renderHook(() => useDisplayCommands(handlers()));
    await flush();

    expect(fetched).toEqual(['/api/display/commands', '/api/system/build-id']);
    expect(published).toEqual([{ buildId: 'build-2' }]);
  });

  it('on a hub that answers without revisions, runs the commands and still hands on the build id', async () => {
    answersRevisions = false;
    commands = [{ type: 'wake', timestamp: 1 }];
    renderHook(() => useDisplayCommands(handlers()));
    await flush();

    expect(fetched).toEqual(['/api/display/commands', '/api/system/build-id']);
    expect(order).toEqual(['wake', 'revisions']);
    expect(published).toEqual([{ buildId: 'build-2' }]);
  });
});

describe('the show-photo command', () => {
  function photo(file: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { url: `/api/backgrounds/serve?file=${file}`, kind: 'image', durationMs: 60_000, ...extra };
  }

  /** Drain one beat of show-photo commands and hand back the handler they reach. */
  async function run(...payloads: Array<Record<string, unknown> | undefined>) {
    commands = payloads.map((payload) => ({ type: 'show-photo', payload, timestamp: 1 }));
    const h = handlers();
    renderHook(() => useDisplayCommands(h, 'kitchen'));
    await flush();
    return vi.mocked(h.showPhoto);
  }

  it('puts a library picture or video up with just its url, kind and duration', async () => {
    const expiresAt = Date.now() + 60_000;
    const showPhoto = await run(
      photo('lake.jpg', { expiresAt }),
      { url: '/api/backgrounds/serve?file=walk.mp4&mt=tok', kind: 'video', durationMs: 30_000, expiresAt },
    );

    expect(showPhoto.mock.calls).toEqual([
      [{ url: '/api/backgrounds/serve?file=lake.jpg', kind: 'image', durationMs: 60_000 }],
      [{ url: '/api/backgrounds/serve?file=walk.mp4&mt=tok', kind: 'video', durationMs: 30_000 }],
    ]);
  });

  it('skips a photo whose time ran out more than a minute ago', async () => {
    const now = Date.now();
    const showPhoto = await run(
      photo('old.jpg', { expiresAt: now - 60_001 }),
      // Within a minute of the hub's clock still counts as on time.
      photo('recent.jpg', { expiresAt: now - 30_000 }),
    );

    expect(showPhoto).toHaveBeenCalledTimes(1);
    expect(showPhoto).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/backgrounds/serve?file=recent.jpg' }));
  });

  it('skips a url that is not the library serve route', async () => {
    const showPhoto = await run(
      photo('a.jpg', { url: 'https://example.com/api/backgrounds/serve?file=a.jpg' }),
      photo('a.jpg', { url: '/api/backgrounds/serve/a.jpg' }),
      photo('a.jpg', { url: '/api/plugins/proxy/x?file=a.jpg' }),
      photo('a.jpg', { url: 'javascript:alert(1)' }),
      photo('a.jpg', { url: 42 }),
      undefined,
      photo('good.jpg'),
    );

    // The last one proves the loop carried on past the ones it skipped.
    expect(showPhoto).toHaveBeenCalledTimes(1);
    expect(showPhoto).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/backgrounds/serve?file=good.jpg' }));
  });

  it('skips an unknown kind or a duration that is not a positive number', async () => {
    const showPhoto = await run(
      photo('a.jpg', { kind: 'audio' }),
      photo('b.jpg', { kind: undefined }),
      photo('c.jpg', { durationMs: 0 }),
      photo('d.jpg', { durationMs: -5_000 }),
      photo('e.jpg', { durationMs: '60000' }),
      photo('good.jpg'),
    );

    expect(showPhoto).toHaveBeenCalledTimes(1);
    expect(showPhoto).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/backgrounds/serve?file=good.jpg' }));
  });

  it('shows a photo that carries no expiry', async () => {
    const showPhoto = await run(photo('lake.jpg'));

    expect(showPhoto).toHaveBeenCalledWith({ url: '/api/backgrounds/serve?file=lake.jpg', kind: 'image', durationMs: 60_000 });
  });
});
