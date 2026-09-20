'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Per-tab hold counter that pauses screen rotation while someone is
 * mid-interaction (e.g. reading a recipe overlay). Counter-based so
 * overlapping holds compose; rotation resumes only when every hold is
 * released. Holders release via cleanup on unmount, so an interaction
 * component's own auto-dismiss timers bound how long rotation can stall.
 */

let holdCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function acquireInteractionHold(): () => void {
  holdCount += 1;
  if (holdCount === 1) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holdCount -= 1;
    if (holdCount === 0) emit();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isHeld = () => holdCount > 0;
const serverIsHeld = () => false;

/** True while any component or tap holds rotation. Outside React, for tests. */
export function interactionIsHeld(): boolean {
  return isHeld();
}

/** The single timed hold, so repeated taps extend one window instead of stacking. */
let tapRelease: (() => void) | null = null;
let tapTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Hold rotation for `ms` after a deliberate touch.
 *
 * A screen change used to land in the middle of someone using it: the chart a
 * finger was heading for became page background and the tap produced nothing,
 * with the next chance to tick a chore two minutes away. A tap on a control is
 * a person standing at the display, so the screen stays put for a moment
 * afterwards and then gets a fresh dwell.
 *
 * Unlike `useInteractionHold` this is not tied to a component's lifetime, so a
 * second tap extends the same window rather than opening another. Returns a
 * release for a caller that wants to end it early.
 */
export function holdInteractionFor(ms: number): () => void {
  if (ms <= 0) return () => {};
  if (tapTimer) clearTimeout(tapTimer);
  if (!tapRelease) tapRelease = acquireInteractionHold();
  const end = () => {
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
    const release = tapRelease;
    tapRelease = null;
    release?.();
  };
  tapTimer = setTimeout(end, ms);
  return end;
}

/** True while any component holds rotation. Read by ScreenRotator. */
export function useInteractionHeld(): boolean {
  return useSyncExternalStore(subscribe, isHeld, serverIsHeld);
}

/** Hold rotation for the lifetime of the calling component. */
export function useInteractionHold(): void {
  useEffect(() => acquireInteractionHold(), []);
}
