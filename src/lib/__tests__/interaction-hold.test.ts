import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { holdInteractionFor, interactionIsHeld } from '@/lib/interaction-hold';

describe('holdInteractionFor', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('holds rotation for the given window and then lets go', () => {
    expect(interactionIsHeld()).toBe(false);
    holdInteractionFor(1000);
    expect(interactionIsHeld()).toBe(true);
    vi.advanceTimersByTime(999);
    expect(interactionIsHeld()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(interactionIsHeld()).toBe(false);
  });

  /* A kid ticking four chores in a row gets the window from the last tap, not
   * four overlapping holds that each expire on their own schedule. */
  it('extends the window on a second tap rather than stacking holds', () => {
    holdInteractionFor(1000);
    vi.advanceTimersByTime(800);
    holdInteractionFor(1000);
    vi.advanceTimersByTime(800);
    expect(interactionIsHeld()).toBe(true);
    vi.advanceTimersByTime(200);
    expect(interactionIsHeld()).toBe(false);
  });

  it('composes with a held overlay rather than releasing it', () => {
    const release = holdInteractionFor(1000);
    holdInteractionFor(500);
    vi.advanceTimersByTime(1000);
    expect(interactionIsHeld()).toBe(false);
    release();
    expect(interactionIsHeld()).toBe(false);
  });

  it('ignores a window of zero or less', () => {
    holdInteractionFor(0);
    expect(interactionIsHeld()).toBe(false);
  });
});
