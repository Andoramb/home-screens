/**
 * A revision for what the media library holds, carried on the wall's
 * heartbeat (`readDisplayRevisions`). Every route that adds, removes, moves
 * or replaces library files bumps it, so a wall re-reads its slideshow lists
 * within a few seconds of a change instead of on the lists' 10-minute poll.
 *
 * In memory only. A hub restart starts a new run id, so every wall reads the
 * library as changed once and re-reads its lists, which also covers anything
 * that changed while the hub was down. Files placed by hand (a USB copy, scp)
 * do not bump it; the lists' own poll still finds those.
 *
 * Held on `globalThis` because route bundles can each carry their own copy of
 * this module (webpack dev does), and the heartbeat must see the bumps every
 * upload and delete route makes.
 */

/** The response header a slideshow list carries: the revision it was read at. */
export const LIBRARY_REVISION_HEADER = 'X-Library-Revision';

interface LibraryRevisionState {
  run: string;
  counter: number;
}

const key = Symbol.for('home-screens.library-revision.v1');
const globals = globalThis as typeof globalThis & { [key]?: LibraryRevisionState };
const state: LibraryRevisionState = globals[key] ??= { run: Date.now().toString(36), counter: 0 };

/** Record that library files changed. */
export function bumpLibraryRevision(): void {
  state.counter += 1;
}

/** The current revision; a different string means the library changed. */
export function libraryRevision(): string {
  return `${state.run}.${state.counter}`;
}
