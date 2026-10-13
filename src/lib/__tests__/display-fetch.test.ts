import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  displayFetch,
  setDisplayToken,
  DISPLAY_FETCH_TIMEOUT_MS,
  DISPLAY_FETCH_LONG_TIMEOUT_MS,
} from '../display-fetch';

/** The init the wrapper handed to fetch on its latest call. */
function lastInit(): RequestInit {
  const call = vi.mocked(fetch).mock.calls.at(-1)!;
  return call[1] as RequestInit;
}

describe('displayFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setDisplayToken(null);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response('ok', { status: 200 })),
      ),
    );
  });

  it('calls fetch without Authorization header when no token is set', async () => {
    await displayFetch('http://localhost/api/config');

    expect(fetch).toHaveBeenCalledWith('http://localhost/api/config', expect.any(Object));
    expect(lastInit().headers).toBeUndefined();
  });

  it('adds Authorization header when token is set', async () => {
    setDisplayToken('my-display-token');

    await displayFetch('http://localhost/api/config');

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer my-display-token');
  });

  it('does not overwrite existing Authorization header', async () => {
    setDisplayToken('my-display-token');

    await displayFetch('http://localhost/api/config', {
      headers: { Authorization: 'Bearer custom-token' },
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer custom-token');
  });

  it('passes through other init options when adding token', async () => {
    setDisplayToken('my-token');

    await displayFetch('http://localhost/api/config', {
      method: 'POST',
      body: '{}',
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });

  it('works with URL objects', async () => {
    const url = new URL('http://localhost/api/config');
    await displayFetch(url);

    expect(fetch).toHaveBeenCalledWith(url, expect.any(Object));
  });

  it('resumes unauthenticated fetch after clearing token', async () => {
    setDisplayToken('my-token');
    setDisplayToken(null);

    await displayFetch('http://localhost/api/config');

    expect(lastInit().headers).toBeUndefined();
  });
});

/**
 * A request the hub never answers must not hold its socket for the minutes
 * TCP allows: five such requests fill Chromium's connections to the hub and
 * every later poll queues behind them, which is a frozen wall.
 */
describe('displayFetch timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDisplayToken(null);
    // A hub that never answers: fetch settles only when its signal fires.
    vi.stubGlobal('fetch', vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aborts an ordinary request after the default timeout', async () => {
    const request = displayFetch('/api/display/commands');
    const outcome = request.then(() => 'answered', (err: Error) => err.name);

    await vi.advanceTimersByTimeAsync(DISPLAY_FETCH_TIMEOUT_MS - 1);
    expect(lastInit().signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(lastInit().signal!.aborted).toBe(true);
    expect(await outcome).toBe('TimeoutError');
  });

  it('gives a request the longer limit it asks for', async () => {
    const request = displayFetch('/api/backgrounds/serve?file=a.jpg', { timeoutMs: DISPLAY_FETCH_LONG_TIMEOUT_MS });
    const outcome = request.then(() => 'answered', (err: Error) => err.name);

    await vi.advanceTimersByTimeAsync(DISPLAY_FETCH_TIMEOUT_MS);
    expect(lastInit().signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(DISPLAY_FETCH_LONG_TIMEOUT_MS - DISPLAY_FETCH_TIMEOUT_MS);
    expect(await outcome).toBe('TimeoutError');
  });

  it('leaves a request unbounded when asked to', async () => {
    void displayFetch('/api/plugins/bundle/x', { timeoutMs: null });

    await vi.advanceTimersByTimeAsync(DISPLAY_FETCH_LONG_TIMEOUT_MS * 10);
    expect(lastInit().signal).toBeUndefined();
  });

  it('still honours the caller\'s own signal, and drops the timer when it fires', async () => {
    const controller = new AbortController();
    const request = displayFetch('/api/config', { signal: controller.signal });
    const outcome = request.then(() => 'answered', (err: Error) => err.name);

    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    expect(await outcome).toBe('AbortError');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not pass the timeout option on to fetch', async () => {
    void displayFetch('/api/config', { timeoutMs: 5_000, method: 'POST' });

    expect(lastInit()).not.toHaveProperty('timeoutMs');
    expect(lastInit().method).toBe('POST');
  });
});
