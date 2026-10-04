'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Per-tab holds that pause screen rotation while someone is using the display.
 *
 * Two kinds, because a person reading and a person tapping want different
 * things from a flick:
 * - An interaction hold (an open overlay such as a recipe) lasts for the
 *   lifetime of the component that took it. Counter-based so overlapping
 *   holds compose; it ends only when every one is released, and an overlay's
 *   own auto-dismiss timers bound how long it can last. It pauses the
 *   rotation timer and turns flick navigation off: the finger is on the
 *   overlay, not on the screen behind it.
 * - A tap hold follows a tap on a control and expires on its own. It pauses
 *   only the rotation timer. Someone who ticks a chore and then flicks wants
 *   the next screen, and a flick is one of the ways a held display is
 *   unstuck, so it must never swallow one.
 */

let overlayCount = 0;
let tapHeld = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function acquireInteractionHold(): () => void {
  overlayCount += 1;
  if (overlayCount === 1) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    overlayCount -= 1;
    if (overlayCount === 0) emit();
  };
}

function setTapHeld(next: boolean) {
  if (tapHeld === next) return;
  tapHeld = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isInteractionHeld = () => overlayCount > 0;
const isRotationHeld = () => overlayCount > 0 || tapHeld;
const serverIsHeld = () => false;

/** True while a component holds the display. Outside React, for tests. */
export function interactionIsHeld(): boolean {
  return isInteractionHeld();
}

/** True while a component or a recent tap holds rotation. Outside React, for tests. */
export function rotationIsHeld(): boolean {
  return isRotationHeld();
}

/** The single timed hold, so repeated taps extend one window instead of stacking. */
let tapTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Hold the rotation timer for `ms` after a deliberate touch.
 *
 * A screen change used to land in the middle of someone using it: the chart a
 * finger was heading for became page background and the tap produced nothing,
 * with the next chance to tick a chore two minutes away. A tap on a control is
 * a person standing at the display, so the screen stays put for a moment
 * afterwards and then gets a fresh dwell.
 *
 * Unlike `useInteractionHold` this is not tied to a component's lifetime, so a
 * second tap extends the same window rather than opening another, and it
 * leaves flick navigation alone. Returns a release for a caller that wants to
 * end it early.
 */
export function holdRotationFor(ms: number): () => void {
  if (ms <= 0) return () => {};
  if (tapTimer) clearTimeout(tapTimer);
  setTapHeld(true);
  const end = () => {
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
    setTapHeld(false);
  };
  tapTimer = setTimeout(end, ms);
  return end;
}

/**
 * True while a component holds the display. ScreenRotator turns flick
 * navigation off for it, as well as the rotation timer.
 */
export function useInteractionHeld(): boolean {
  return useSyncExternalStore(subscribe, isInteractionHeld, serverIsHeld);
}

/**
 * True while anything holds the rotation timer: a component, or a tap on a
 * control in the last few seconds. Read by ScreenRotator's rotation timer.
 */
export function useRotationHeld(): boolean {
  return useSyncExternalStore(subscribe, isRotationHeld, serverIsHeld);
}

/** Hold rotation and flick navigation for the lifetime of the calling component. */
export function useInteractionHold(): void {
  useEffect(() => acquireInteractionHold(), []);
}
