// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSleepManager } from '../useSleepManager';
import type { SleepSettings } from '@/types/config';

/**
 * A remote/Display Control brightness is tracked as its own thing
 * (`brightnessOverride`), distinct from the idle and scheduled dims that share
 * the 'dimmed' display state. SleepOverlay keys the screensaver on it, and the
 * reported `brightness` must keep reading the level a person actually sees.
 *
 * The chosen level is the wall's awake level until someone picks another:
 * dims, sleep and alerts take over while they last, and whatever ends them
 * comes back to it. It used to be thrown away by the first touch, so the wall
 * jumped to full and the phone's slider followed.
 */
const IDLE_DIM: SleepSettings = {
  enabled: true,
  dimAfterMinutes: 1,
  sleepAfterMinutes: 0,
  dimBrightness: 20,
};

describe('useSleepManager brightness override', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('is null while active, and a wake keeps the chosen level', () => {
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    expect(result.current.brightnessOverride).toBeNull();
    expect(result.current.brightness).toBe(100);

    act(() => { result.current.setRemoteBrightness(30); });
    expect(result.current.brightnessOverride).toBe(30);
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.brightness).toBe(30);

    act(() => { result.current.wake(); });
    expect(result.current.brightnessOverride).toBe(30);
    expect(result.current.brightness).toBe(30);
  });

  it('is null for an idle dim, which reports the configured dim level', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM, undefined));
    await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.brightnessOverride).toBeNull();
    expect(result.current.brightness).toBe(20);
  });

  /* Set 40% from the phone, then a kid ticks a to-do on the wall: the wall
   * used to jump to full and the phone's slider followed it there. */
  it('keeps a chosen brightness through a touch, a click or a key', () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM, undefined));
    act(() => { result.current.setRemoteBrightness(40); });
    for (const type of ['touchstart', 'mousedown', 'mousemove', 'keydown']) {
      act(() => { window.dispatchEvent(new Event(type)); });
      expect(result.current.displayState).toBe('dimmed');
      expect(result.current.brightnessOverride).toBe(40);
      expect(result.current.brightness).toBe(40);
    }
  });

  it('counts the touch toward the idle clock while keeping the chosen brightness', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM, undefined));
    act(() => { result.current.setRemoteBrightness(40); });
    await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
    act(() => { window.dispatchEvent(new Event('touchstart')); });
    // A minute after the brightness was set but only 20s after the touch.
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.brightnessOverride).toBe(40);
  });

  it('comes back to the chosen level when a touch ends an idle dim', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM, undefined));
    act(() => { result.current.setRemoteBrightness(40); });
    // The idle dim takes over while it lasts, with its screensaver.
    await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.brightnessOverride).toBeNull();
    expect(result.current.brightness).toBe(20);

    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.brightnessOverride).toBe(40);
    expect(result.current.brightness).toBe(40);
  });

  it('comes back to the chosen level when the idle clock has slept the wall', async () => {
    const { result } = renderHook(() => useSleepManager({ ...IDLE_DIM, sleepAfterMinutes: 1 }, undefined));
    act(() => { result.current.setRemoteBrightness(40); });
    await act(async () => { await vi.advanceTimersByTimeAsync(130_000); });
    expect(result.current.displayState).toBe('asleep');

    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.brightness).toBe(40);
  });

  it('never brightens a chosen level darker than the idle dim', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM, undefined));
    act(() => { result.current.setRemoteBrightness(10); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(result.current.brightnessOverride).toBe(10);
    expect(result.current.brightness).toBe(10);
  });

  it('comes back to the chosen level when a dim window ends', async () => {
    vi.setSystemTime(new Date(2025, 0, 15, 11, 59, 0));
    const dimAtNoon: SleepSettings = {
      enabled: true,
      idleDimEnabled: false,
      dimAfterMinutes: 1,
      sleepAfterMinutes: 0,
      dimBrightness: 20,
      dimSchedule: { startTime: '12:00', endTime: '12:05' },
    };
    const { result } = renderHook(() => useSleepManager(dimAtNoon, undefined));
    act(() => { result.current.setRemoteBrightness(40); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
    expect(result.current.brightnessOverride).toBeNull();
    expect(result.current.brightness).toBe(20);

    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(result.current.brightnessOverride).toBe(40);
    expect(result.current.brightness).toBe(40);
  });

  it('never brightens a chosen level darker than the dim window', async () => {
    vi.setSystemTime(new Date(2025, 0, 15, 11, 59, 0));
    const dimAtNoon: SleepSettings = {
      enabled: true,
      idleDimEnabled: false,
      dimAfterMinutes: 1,
      sleepAfterMinutes: 0,
      dimBrightness: 20,
      dimSchedule: { startTime: '12:00', endTime: '12:05' },
    };
    const { result } = renderHook(() => useSleepManager(dimAtNoon, undefined));
    act(() => { result.current.setRemoteBrightness(10); });
    // Inside the window.
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
    expect(result.current.brightnessOverride).toBe(10);
    expect(result.current.brightness).toBe(10);
    // After it.
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(result.current.brightnessOverride).toBe(10);
    expect(result.current.brightness).toBe(10);
  });

  it('comes back to the chosen level after a sleep, by touch or by wake', () => {
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    act(() => { result.current.setRemoteBrightness(40); });

    act(() => { result.current.forceSleep(); });
    expect(result.current.brightness).toBe(0);
    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.brightness).toBe(40);

    // Brightness 0 is a sleep too, not a new level.
    act(() => { result.current.setRemoteBrightness(0); });
    expect(result.current.brightness).toBe(0);
    act(() => { result.current.wake(); });
    expect(result.current.brightness).toBe(40);
  });

  it('gives an urgent alert full brightness while it is up, then the chosen level', () => {
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    act(() => { result.current.setRemoteBrightness(40); });

    act(() => { result.current.wakeForAlert(); });
    expect(result.current.brightness).toBe(100);
    // The tap that dismisses the alert does not drop it to 40 early.
    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.brightness).toBe(100);

    act(() => { result.current.releaseAlertWake(); });
    expect(result.current.brightnessOverride).toBe(40);
    expect(result.current.brightness).toBe(40);
  });

  it('forgets the chosen level once someone sets full', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM, undefined));
    act(() => { result.current.setRemoteBrightness(40); });
    act(() => { result.current.setRemoteBrightness(100); });
    expect(result.current.displayState).toBe('active');
    expect(result.current.brightness).toBe(100);

    await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
    expect(result.current.brightness).toBe(20);
    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.displayState).toBe('active');
    expect(result.current.brightness).toBe(100);
  });

  it('still ends an idle dim at full brightness', async () => {
    const { result } = renderHook(() => useSleepManager(IDLE_DIM, undefined));
    await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
    expect(result.current.displayState).toBe('dimmed');
    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.displayState).toBe('active');
    expect(result.current.brightness).toBe(100);
  });

  it('still brightens a scheduled dim on a touch, and the schedule comes back', async () => {
    const dimAllDay: SleepSettings = {
      enabled: true,
      dimAfterMinutes: 600,
      sleepAfterMinutes: 0,
      dimBrightness: 20,
      wakeHoldMinutes: 1,
      dimSchedule: { startTime: '00:00', endTime: '23:59' },
    };
    const { result } = renderHook(() => useSleepManager(dimAllDay, undefined));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.brightness).toBe(20);

    act(() => { window.dispatchEvent(new Event('touchstart')); });
    expect(result.current.displayState).toBe('active');
    expect(result.current.brightness).toBe(100);

    // The wake hold runs out and the window dims it again.
    await act(async () => { await vi.advanceTimersByTimeAsync(70_000); });
    expect(result.current.displayState).toBe('dimmed');
    expect(result.current.brightness).toBe(20);
  });

  it('brightness 0 is a sleep, not an override', () => {
    const { result } = renderHook(() => useSleepManager(undefined, undefined));
    act(() => { result.current.setRemoteBrightness(0); });
    expect(result.current.displayState).toBe('asleep');
    expect(result.current.brightnessOverride).toBeNull();
    expect(result.current.brightness).toBe(0);
  });
});
