import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readChoreData, readChoreSnapshot, writeChoreData } from '@/lib/chore-data';
import { contentRevision } from '@/lib/content-revision';
import type { ChoreDefinition } from '@/types/config';
import { withAuth, withDisplayAuth, guardEmptyOverwrite, assertRequiredArrays, parseJsonBody } from '@/lib/api-utils';
import { withFamilyData, validateMemberReferences } from '@/lib/family-api';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async () => {
  return NextResponse.json(await readChoreSnapshot());
}, 'Failed to read chore data');

/**
 * Replace the chore list. The body quotes the `revision` its list was built
 * from (from GET or the previous save); one built from an older copy comes
 * back as a 409 with `reason: 'revision'` and the current list, so the
 * surface can show what is there now instead of overwriting it.
 */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<{ chores: ChoreDefinition[]; members?: unknown; force?: boolean; revision?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  if (body && Object.hasOwn(body, 'members')) {
    return NextResponse.json({ error: 'Family has moved. Refresh this page before saving.', code: 'refresh_required' }, { status: 409 });
  }
  const invalid = assertRequiredArrays(body, ['chores']);
  if (invalid) return invalid;
  const { chores, force, revision } = body;
  if (typeof revision !== 'string' || !revision) {
    return NextResponse.json({ error: 'Reload the page and try again.' }, { status: 400 });
  }
  return withFamilyData(async () => {
    if (chores.some((chore) => !chore || !Array.isArray(chore.assigneeIds))) {
      return NextResponse.json({ error: 'Each chore needs an assignee list.' }, { status: 400 });
    }
    const references = await validateMemberReferences(chores.flatMap((chore) => [
      ...chore.assigneeIds, ...Object.keys(chore.schedule ?? {}),
    ]));
    if (references) return references;
    // A list that cannot be read has nothing to compare against; the write is
    // what repairs it, and the empty guard below keeps its own reading.
    let current: ChoreDefinition[] | null = null;
    try { current = (await readChoreData()).chores; } catch { /* unreadable */ }
    if (current && revision !== contentRevision(current)) {
      return NextResponse.json({
        error: 'Somebody else changed the chores. Reload the page and make your change again.',
        reason: 'revision',
        chores: current,
        revision: contentRevision(current),
      }, { status: 409 });
    }
    const guard = await guardEmptyOverwrite([chores], async () => [current ?? []], 'chore', force);
    if (guard) return guard;
    await writeChoreData({ chores });
    return NextResponse.json({ chores, revision: contentRevision(chores) });
  });
}, 'Failed to write chore data');
