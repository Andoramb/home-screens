import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SMALL_BODY_BYTES, parseJsonBody, withAuth } from '@/lib/api-utils';
import { checkTimetableSheet } from '@/lib/timetable-api';

export const dynamic = 'force-dynamic';

/**
 * Read a pasted spreadsheet link before anything is saved, so the import
 * screen can show which tabs the sheet has, what is in each of them and who
 * each one looks like it belongs to. Nothing is written here: applying an
 * import is an ordinary save of the whole document from the editor.
 *
 * Editor session only. The server builds every URL it fetches from the id in
 * the pasted text, so this cannot be used to look anywhere else.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ url?: unknown } | null>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'Missing required field: url' }, { status: 400 });
  }
  return NextResponse.json(await checkTimetableSheet(url));
}, 'We could not read that spreadsheet. Try again in a moment.');
