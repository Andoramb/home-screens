import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, withAuth, withDisplayAuth } from '@/lib/api-utils';
import { timetableRead, timetableWrite } from '@/lib/timetable-api';

export const dynamic = 'force-dynamic';

/**
 * Room for the biggest document the store will accept: every person at the
 * household's limit, both weeks filled from first period to last, plus the
 * shared subject list. A real household is a fraction of this.
 */
const MAX_TIMETABLE_BYTES = 2 * 1024 * 1024;

/**
 * The whole document and the revision a save has to quote back. The wall and
 * the editor read the same thing, so the display token is enough.
 */
export const GET = withDisplayAuth(
  () => timetableRead(),
  'Your timetables could not be loaded. Try again in a moment.',
);

/**
 * Save the whole document. The revision decides whether the save lands: one
 * that started from an older copy comes back as a conflict carrying what is
 * saved now, so the editor can offer to reload it.
 */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ data?: unknown; revision?: unknown } | null>(request, {
    maxBytes: MAX_TIMETABLE_BYTES,
  });
  if (body instanceof NextResponse) return body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an object' }, { status: 400 });
  }
  return timetableWrite({ data: body.data, revision: body.revision });
}, 'Your timetables could not be saved. Try again in a moment.');
