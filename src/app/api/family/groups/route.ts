import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';
import { replaceFamilyGroups } from '@/lib/family-data';

export const dynamic = 'force-dynamic';

export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<Parameters<typeof replaceFamilyGroups>[0]>(request);
  if (body instanceof NextResponse) return body;
  return NextResponse.json(await replaceFamilyGroups(body));
}, 'Your groups could not be saved. Try again in a moment.');
