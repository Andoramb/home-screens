import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, withAuth } from '@/lib/api-utils';
import { readTimetableFiles } from '@/lib/timetable-api';

export const dynamic = 'force-dynamic';

/**
 * Room for a handful of spreadsheets exported as text. A week is a few hundred
 * bytes; this is generous enough for a file with a term of notes in the margins
 * and small enough that nobody can post their music library.
 */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** One file at a time is the common case; a household with four children is not. */
const MAX_FILES = 16;

/**
 * Read one or more spreadsheets the household picked off their own machine.
 *
 * The browser reads the file and posts its text, so nothing is uploaded and no
 * file is written anywhere. The reading happens here because it needs the
 * household's subject list and family roster to match codes and name tabs, and
 * both of those live on this side.
 *
 * Editor session only, and nothing is saved: applying an import is an ordinary
 * save of the whole document, exactly as it is for a pasted link.
 */
export const POST = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ files?: unknown } | null>(request, { maxBytes: MAX_FILE_BYTES });
  if (body instanceof NextResponse) return body;

  const raw = Array.isArray(body?.files) ? body.files : null;
  if (!raw || raw.length === 0) {
    return NextResponse.json({ error: 'Missing required field: files' }, { status: 400 });
  }
  const files = raw.slice(0, MAX_FILES).map((entry) => {
    const file = entry as { name?: unknown; text?: unknown } | null;
    return {
      name: typeof file?.name === 'string' ? file.name : '',
      text: typeof file?.text === 'string' ? file.text : '',
    };
  });
  if (files.some((file) => file.text === '')) {
    return NextResponse.json({ error: 'Every file needs its text' }, { status: 400 });
  }
  return NextResponse.json(await readTimetableFiles(files));
}, 'We could not read that file. Try again in a moment.');
