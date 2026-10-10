// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager } from '../useSleepManager';
import type { SleepSettings } from '@/types/config';

/**
 * A pointer that appears over the window without moving must not wake the
 * display.
 *
 * Seen on a Pi with labwc 0.20: a monitor that drops its HDMI connection in
 * standby comes back as a new screen, labwc places the cursor on it, and
 * Chromium delivers a trusted mousemove with movementX and movementY both 0.
 * The display woke every nine seconds all night. A real hand on a mouse moves
 * it by at least a pixel, and a finger arrives as touchstart.
 */
const SLEEP: SleepSettings = {
  enabled: true,
  idleDimEnabled: true,
  dimAfterMinutes: 10,
  sleepAfterMinutes: 0,
  dimBrightness: 20,
};

function mouseMove(movementX: number, movementY: number) {
  return new MouseEvent('mousemove', { clientX: 100, clientY: 100, movementX, movementY });
}

describe('useSleepManager: a pointer that only appears', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('does not wake a sleeping display', async () => {
    const { result } = renderHook(() => useSleepManager(SLEEP, undefined));
    act(() => { result.current.forceSleep(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

    act(() => { window.dispatchEvent(mouseMove(0, 0)); });

    expect(result.current.displayState).toBe('asleep');
  });

  it('does not count as activity for the idle clock', async () => {
    const { result } = renderHook(() => useSleepManager(SLEEP, undefined));
    // Nine minutes idle, then only a pointer appearing: the dim at ten minutes still lands.
    await act(async () => { await vi.advanceTimersByTimeAsync(9 * 60_000); });
    act(() => { window.dispatchEvent(mouseMove(0, 0)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(result.current.displayState).toBe('dimmed');
  });

  it('a pointer that moves still wakes it', async () => {
    const { result } = renderHook(() => useSleepManager(SLEEP, undefined));
    act(() => { result.current.forceSleep(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

    act(() => { window.dispatchEvent(mouseMove(1, 0)); });

    expect(result.current.displayState).toBe('active');
  });

  it('a touch still wakes it', async () => {
    const { result } = renderHook(() => useSleepManager(SLEEP, undefined));
    act(() => { result.current.forceSleep(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

    act(() => { window.dispatchEvent(new Event('touchstart')); });

    expect(result.current.displayState).toBe('active');
  });
});
