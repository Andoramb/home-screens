// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const { editorFetch } = vi.hoisted(() => ({
  editorFetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(),
}));
vi.mock('@/lib/editor-fetch', () => ({ editorFetch }));

import { useGooglePickerSession, type PickerSession } from '../useGooglePickerSession';

const SESSION: PickerSession = { id: 'sess-1', pickerUri: 'https://photos.google.com/picker/sess-1', pollIntervalMs: 3000 };
const POLL_URL = '/api/google-picker/session?id=sess-1';

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** What each poll answers, in order; an Error is a fetch that throws. Once empty, "not picked yet". */
let polls: (Response | Error | Promise<Response>)[];

/** The hub: opening answers with the session, and a poll with the next queued answer. */
function hub(session: PickerSession = SESSION) {
  editorFetch.mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') return reply(200, session);
    if (init?.method === 'DELETE') return reply(204, null);
    const next = polls.shift() ?? reply(200, { mediaItemsSet: false });
    if (next instanceof Error) throw next;
    return next;
  });
}

/** The polls made so far, by URL. */
const polled = () => editorFetch.mock.calls.filter(([, init]) => init === undefined).map(([url]) => url);

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

async function openSession(onEnd = vi.fn()) {
  const view = renderHook(() => useGooglePickerSession(onEnd));
  await act(async () => { await view.result.current.open(); });
  return { ...view, onEnd };
}

beforeEach(() => {
  vi.useFakeTimers();
  editorFetch.mockReset();
  polls = [];
  hub();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useGooglePickerSession', () => {
  it('open() asks the hub for a session and hands it back', async () => {
    const { result } = renderHook(() => useGooglePickerSession(vi.fn()));
    let opened: PickerSession | undefined;
    await act(async () => { opened = await result.current.open(); });

    expect(editorFetch).toHaveBeenCalledWith('/api/google-picker/session', { method: 'POST' });
    expect(opened).toEqual(SESSION);
    expect(result.current.session).toEqual(SESSION);
  });

  it.each([
    [3000, 3000],
    [500, 2000],
    [0, 5000],
  ])('with a poll interval of %i ms, asks every %i ms', async (asked, every) => {
    hub({ ...SESSION, pollIntervalMs: asked });
    await openSession();

    await advance(every - 1);
    expect(polled()).toEqual([]);
    await advance(1);
    expect(polled()).toEqual([POLL_URL]);
    await advance(every);
    expect(polled()).toEqual([POLL_URL, POLL_URL]);
  });

  it('ends as picked once the picks are in, and stops asking', async () => {
    polls = [reply(200, { mediaItemsSet: false }), reply(200, { mediaItemsSet: true })];
    const { result, onEnd } = await openSession();

    await advance(3000);
    expect(onEnd).not.toHaveBeenCalled();
    await advance(3000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith('picked', 'sess-1');
    expect(result.current.session).toBeNull();

    await advance(30_000);
    expect(polled()).toHaveLength(2);
  });

  it('ends as expired when the session is gone', async () => {
    polls = [reply(404, { error: 'Not found' })];
    const { onEnd } = await openSession();

    await advance(3000);
    expect(onEnd).toHaveBeenCalledWith('expired', 'sess-1');
    await advance(30_000);
    expect(polled()).toHaveLength(1);
  });

  it('ends as failed after five failures in a row', async () => {
    polls = Array.from({ length: 5 }, () => reply(500, { error: 'Google did not answer' }));
    const { onEnd } = await openSession();

    await advance(4 * 3000);
    expect(onEnd).not.toHaveBeenCalled();
    await advance(3000);
    expect(onEnd).toHaveBeenCalledWith('failed', 'sess-1');
    await advance(30_000);
    expect(polled()).toHaveLength(5);
  });

  it('starts counting again after an answer that works', async () => {
    const failure = () => reply(500, {});
    polls = [failure(), failure(), failure(), failure(), reply(200, { mediaItemsSet: false }), failure(), failure(), failure(), failure(), failure()];
    const { onEnd } = await openSession();

    await advance(9 * 3000);
    expect(onEnd).not.toHaveBeenCalled();
    await advance(3000);
    expect(onEnd).toHaveBeenCalledWith('failed', 'sess-1');
  });

  it('counts a fetch that throws as a failure too', async () => {
    polls = [new Error('offline'), reply(500, {}), new Error('offline'), reply(502, {}), new Error('offline')];
    const { onEnd } = await openSession();

    await advance(4 * 3000);
    expect(onEnd).not.toHaveBeenCalled();
    await advance(3000);
    expect(onEnd).toHaveBeenCalledWith('failed', 'sess-1');
  });

  it('cancel() tells the hub, stops asking and reports nothing', async () => {
    const { result, onEnd } = await openSession();
    await advance(3000);
    expect(polled()).toHaveLength(1);

    act(() => result.current.cancel());

    expect(editorFetch).toHaveBeenLastCalledWith(POLL_URL, { method: 'DELETE' });
    expect(result.current.session).toBeNull();
    await advance(30_000);
    expect(polled()).toHaveLength(1);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('ignores a poll answer that lands after cancel()', async () => {
    let answer!: (res: Response) => void;
    polls = [new Promise((resolve) => { answer = resolve; })];
    const { result, onEnd } = await openSession();
    await advance(3000);

    act(() => result.current.cancel());
    await act(async () => { answer(reply(404, { error: 'Not found' })); });

    expect(onEnd).not.toHaveBeenCalled();
    await advance(30_000);
    expect(polled()).toHaveLength(1);
  });

  it('ignores picks whose details land after cancel()', async () => {
    let details!: (body: unknown) => void;
    polls = [{ ok: true, status: 200, json: () => new Promise((resolve) => { details = resolve; }) } as Response];
    const { result, onEnd } = await openSession();
    await advance(3000);

    act(() => result.current.cancel());
    await act(async () => { details({ mediaItemsSet: true }); });

    expect(onEnd).not.toHaveBeenCalled();
  });

  it('open() fails with the hub\'s reason and starts no polling', async () => {
    editorFetch.mockResolvedValueOnce(reply(502, { error: 'Could not reach Google Photos' }));
    const { result } = renderHook(() => useGooglePickerSession(vi.fn()));

    await act(async () => {
      await expect(result.current.open()).rejects.toThrow('Could not reach Google Photos');
    });

    expect(result.current.session).toBeNull();
    await advance(30_000);
    expect(editorFetch).toHaveBeenCalledTimes(1);
  });
});
