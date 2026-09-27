'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

/**
 * Overlays that have asked for their history entry back but have not had it
 * yet, keyed by the entry they own.
 *
 * Handing an entry back means a history traversal, and a traversal is
 * asynchronous: it arrives as a `popstate` some time later, and browsers do
 * not agree on where it lands when something pushed onto the stack while it
 * was in flight. React mounts, tears down and remounts every effect a second
 * time in development, so a release fired by that teardown was still
 * travelling when the overlay mounted again, and came back looking exactly
 * like a person pressing Back. The overlay closed itself a quarter second
 * after opening.
 *
 * So a teardown only asks, one turn later, and a mount that follows it takes
 * the request back and keeps the entry it already has. A development remount
 * therefore performs no traversal at all, which is what makes this safe
 * without having to predict where one would have landed.
 *
 * Module scope on purpose: it has to outlive the component state that React
 * throws away between those two mounts.
 */
const pendingReleases = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Whether this document is on its way to another page.
 *
 * A traversal started while the browser is already fetching the next document
 * cancels that navigation, and the tab sits on the old page with nothing to
 * say why. The window is real: an overlay dismissed by its own save asks for
 * its entry back a macrotask later, which is long enough for something else
 * to have started a navigation in between.
 *
 * So once the page is leaving, no overlay reaches for its entry again: the
 * whole stack belongs to the next document. `pageshow` clears it for a page
 * restored from the back/forward cache, which is alive again and owns its
 * stack.
 */
let leavingPage = false;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { leavingPage = true; });
  window.addEventListener('pagehide', () => { leavingPage = true; });
  window.addEventListener('pageshow', () => { leavingPage = false; });
}

function requestRelease(entryId: string, release: () => void): void {
  cancelRelease(entryId);
  pendingReleases.set(entryId, setTimeout(() => {
    pendingReleases.delete(entryId);
    release();
  }, 0));
}

function cancelRelease(entryId: string): void {
  const pending = pendingReleases.get(entryId);
  if (pending === undefined) return;
  clearTimeout(pending);
  pendingReleases.delete(entryId);
}

/**
 * One history entry held for as long as a full-screen overlay is open (a
 * form, the photo viewer), so the Back gesture, the first thing a thumb
 * reaches for to leave one, closes the overlay instead of unloading the
 * remote. The entry carries the overlay's own id, and whether it owns one is
 * read back off the stack rather than tracked beside it: a flag and a history
 * stack drift apart the moment a traversal is in flight.
 *
 * `onBack` runs when the person goes back, but not for a traversal the
 * overlay started itself, nor when an overlay stacked on top of it closed. It
 * returns true when the overlay stays open (a prompt it answered instead, a
 * save in flight), and the entry is taken again. Call `release()` as the
 * overlay closes by its own control; one dismissed any other way asks for its
 * entry back when it unmounts.
 */
export function useBackGesture(onBack: () => boolean): { release: () => void } {
  const entryId = useId();
  const released = useRef(false);
  const selfPop = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const ownsEntry = useCallback(
    () => (window.history.state as { hsSheet?: string } | null)?.hsSheet === entryId,
    [entryId],
  );

  const takeEntry = useCallback(() => {
    if (ownsEntry()) return;
    // Same URL, so nothing about the address changes and a reload still lands
    // on the tab the overlay was opened from.
    window.history.pushState(
      { ...(window.history.state ?? {}), hsSheet: entryId },
      '',
      window.location.href,
    );
  }, [entryId, ownsEntry]);

  const releaseEntry = useCallback(() => {
    // Never start a second traversal over one already in flight, and never
    // start one at all while the page is leaving: see `leavingPage`.
    if (leavingPage || selfPop.current || !ownsEntry()) return;
    selfPop.current = true;
    window.history.back();
  }, [ownsEntry]);

  useEffect(() => {
    // A mount that follows a teardown of the same overlay (React does exactly
    // that in development) keeps the entry the teardown had asked to give
    // back, so no traversal is ever in flight across a remount.
    cancelRelease(entryId);
    takeEntry();
    function onPopState() {
      if (selfPop.current) {
        selfPop.current = false;
        // A traversal this overlay started can arrive after the stack has
        // moved on, and where it lands differs between browsers, so read
        // nothing into where we are: if the overlay is still open it still
        // needs an entry under it.
        if (!released.current) takeEntry();
        return;
      }
      // Still standing on one of this overlay's own entries: nobody left, an
      // overlay stacked on top of this one closed.
      if (ownsEntry()) return;
      // Anything that keeps the overlay open has to keep its entry too.
      if (onBackRef.current()) takeEntry();
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Dismissed some other way (a save that closed the sheet): ask for the
      // entry back, or Back would land on a step that does nothing. Only ask:
      // see pendingReleases for why this cannot navigate on the spot.
      requestRelease(entryId, releaseEntry);
    };
  }, [entryId, takeEntry, ownsEntry, releaseEntry]);

  const release = useCallback(() => {
    released.current = true;
    releaseEntry();
  }, [releaseEntry]);

  return { release };
}
