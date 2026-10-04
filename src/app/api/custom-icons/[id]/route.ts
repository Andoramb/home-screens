import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, withAuth } from '@/lib/api-utils';
import { cropCustomIconToSquare, deleteCustomIcon, updateCustomIcon } from '@/lib/custom-icon-data';
import { customIconErrorResponse, withUrls } from '@/lib/custom-icon-http';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Rename (`{ name }`), keep a pending upload (`{ keep: true }`), or cut a
 * pending still picture to its centre square (`{ crop: 'square' }`).
 */
export const PATCH = withAuth(async (request: NextRequest, context: RouteContext) => {
  const { id } = await context.params;
  const body = await parseJsonBody<{ name?: unknown; keep?: unknown; crop?: unknown }>(request);
  if (body instanceof NextResponse) return body;
  try {
    const updated = body.crop === 'square'
      ? await cropCustomIconToSquare(id)
      : await updateCustomIcon(id, { name: body.name, keep: body.keep === true });
    const [icon] = await withUrls([updated]);
    return NextResponse.json({ icon });
  } catch (error) {
    return customIconErrorResponse(error);
  }
}, 'Failed to rename icon');

/**
 * Remove one icon. Everything that used it goes back to its kind's standard
 * picture in the same step (see `deleteCustomIcon`); `configRevision` and
 * `previousConfigRevision` come back when that reached the screen config.
 */
export const DELETE = withAuth(async (_request: NextRequest, context: RouteContext) => {
  const { id } = await context.params;
  try {
    const { config } = await deleteCustomIcon(id);
    // A screen icon field pointed at it, so the config was rewritten: hand
    // back the revision it was rewritten from and the one it left, so an
    // editor holding a copy of exactly that version can move onto the new one
    // (see adoptHubRewrite).
    return NextResponse.json({
      ok: true,
      ...(config ? { configRevision: config.revision, previousConfigRevision: config.previousRevision } : {}),
    });
  } catch (error) {
    return customIconErrorResponse(error);
  }
}, 'Failed to remove icon');
