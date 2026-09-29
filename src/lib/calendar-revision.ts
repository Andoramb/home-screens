/**
 * A revision for what the hub's calendar sources can read, carried on the
 * wall's heartbeat (`readDisplayRevisions`). A Google Calendar sign-in or
 * disconnect bumps it. The calendar route keys its cache on it, so the next
 * read goes to Google instead of handing back the answer from before the
 * sign-in, and a wall re-reads its calendar within a few seconds instead of
 * showing "needs to sign in again" until its next 5-minute poll.
 */
import { createHubRevision } from './hub-revision';

/** The response header a calendar answer carries: the revision it was read at. */
export const CALENDAR_REVISION_HEADER = 'X-Calendar-Revision';

const revision = createHubRevision('calendar');

/** Record that what the calendar sources can read changed. */
export const bumpCalendarRevision = revision.bump;

/** The current revision; a different string means the sources changed. */
export const calendarRevision = revision.current;
