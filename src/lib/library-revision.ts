/**
 * A revision for what the media library holds, carried on the wall's
 * heartbeat (`readDisplayRevisions`). Every route that adds, removes, moves
 * or replaces library files bumps it, so a wall re-reads its slideshow lists
 * within a few seconds of a change instead of on the lists' 10-minute poll.
 *
 * Files placed by hand (a USB copy, scp) do not bump it; the lists' own poll
 * still finds those.
 */
import { createHubRevision } from './hub-revision';

/** The response header a slideshow list carries: the revision it was read at. */
export const LIBRARY_REVISION_HEADER = 'X-Library-Revision';

const revision = createHubRevision('library');

/** Record that library files changed. */
export const bumpLibraryRevision = revision.bump;

/** The current revision; a different string means the library changed. */
export const libraryRevision = revision.current;
