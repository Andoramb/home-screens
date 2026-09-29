// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager } from '../useSleepManager';
import type { SleepSettings } from '@/types/config';

/**
 * An explicit sleep has to outlast the idle timer.
 *
 * The regression: with idle dimming on and idle sleep off (the defaults), the
 * remote's Sleep button put the display to sleep, and the idle check ten
 * seconds later saw the idle clock forceSleep had zeroed and moved it back to
 * dimmed. With "Switch the screen's power off too" on, the panel went dark and
 * lit up again a few seconds later.
 */
const IDLE_DIM_NO_IDLE_SLEEP: SleepSettings = {
  enabled: true,
  idleDimEnabled: true,
  dimAfterMinutes: 10,
  sleepAfterMinutes: 0,
  dimBrightness: 20,
};

describe('useSleepManager: explicit sleep with idle dimming on', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('stays asleep through the idle checks', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM_NO_IDLE_SLEEP, undefined));

    act(() => { result.current.forceSleep(); });
    expect(result.current.displayState).toBe('asleep');

    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(result.current.displayState).toBe('asleep');
    expect(result.current.dimOpacity).toBe(1);
  });

  it('stays asleep after a remote brightness of zero too', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM_NO_IDLE_SLEEP, undefined));

    act(() => { result.current.setRemoteBrightness(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(result.current.displayState).toBe('asleep');
  });

  it('still wakes on touch', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM_NO_IDLE_SLEEP, undefined));

    act(() => { result.current.forceSleep(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    act(() => { window.dispatchEvent(new Event('touchstart')); });

    expect(result.current.displayState).toBe('active');
  });

  it('still dims an awake display once it has been idle long enough', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM_NO_IDLE_SLEEP, undefined));

    await act(async () => { await vi.advanceTimersByTimeAsync(9 * 60_000); });
    expect(result.current.displayState).toBe('active');

    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
    expect(result.current.displayState).toBe('dimmed');
  });
});
