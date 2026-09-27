import { NextResponse } from 'next/server';
import { getGoogleAppsStatus } from '@/lib/google-token-stores';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * Which Google app Calendar and Photos sign in with, and whether Home
 * Screens' own app is on at all. Reads saved settings only, never Google, so
 * the editor can ask on every page that offers a Google sign-in.
 */
export const GET = withAuth(async () => {
  return NextResponse.json(await getGoogleAppsStatus());
}, 'Failed to check Google sign-in');
