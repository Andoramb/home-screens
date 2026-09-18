import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getVersionInfo, getVersionTags, type VersionResponse } from '@/lib/version';
import { parseUpdateChannel } from '@/lib/semver';
import { isUpgradeRunning } from '@/lib/upgrade';
import { readConfig } from '@/lib/config';
import { readFailedUpdate } from '@/lib/upgrade-failed-state';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest) => {
  const forceCheck = request.nextUrl.searchParams.get('check') === 'true';
  const channel = parseUpdateChannel(request.nextUrl.searchParams.get('channel'));

  // The schema stamped on the saved config decides whether a step back may
  // be offered (see update-policy.ts). Unreadable means unknown, never blocked.
  const localSchema = await readConfig().then((config) => config.version ?? null, () => null);
  const [info, tags, lastFailedUpdate] = await Promise.all([
    getVersionInfo({ force: forceCheck, channel, localSchema }),
    getVersionTags({ force: forceCheck, channel }),
    readFailedUpdate(),
  ]);

  const payload: VersionResponse = {
    ...info,
    tags: tags.slice(0, 20), // Last 20 versions
    upgradeRunning: isUpgradeRunning(),
    lastFailedUpdate,
    localSchema,
  };
  return NextResponse.json(payload);
}, 'Failed to get version info');
