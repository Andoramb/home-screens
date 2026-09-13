import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SMALL_BODY_BYTES, parseJsonBody, withAuth } from '@/lib/api-utils';
import { syncDueSheets } from '@/lib/timetable-sync';

export const dynamic = 'force-dynamic';

/**
 * Look at one person's spreadsheet now, rather than waiting for the hourly
 * check that rides the wall's own poll.
 *
 * This is the "Check now" button, so it does wait for the answer: somebody is
 * watching, and the point of pressing it is to find out. Everything it does is
 * the ordinary check, including leaving the saved week alone when the sheet
 * cannot be read. The reply carries nothing but a count; the editor re-reads
 * the document to see what changed, which is the same path every other edit in
 * that window takes.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ memberId?: unknown } | null>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const memberId = typeof body?.memberId === 'string' ? body.memberId.trim() : '';
  if (!memberId) {
    return NextResponse.json({ error: 'Missing required field: memberId' }, { status: 400 });
  }
  return NextResponse.json({ checked: await syncDueSheets({ force: memberId }) });
}, 'We could not check that spreadsheet. Try again in a moment.');
