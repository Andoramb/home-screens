import { NextResponse } from 'next/server';
import { cachedProxyRoute, parseCommaList } from '@/lib/api-utils';
import { LEAGUE_MAP } from '@/lib/espn';
import type { TeamOption } from '@/lib/espn';
import { ROSTER_TTL_MS, rosterFor } from '@/lib/espn-rosters';

export const dynamic = 'force-dynamic';

function parseLeagues(param: string | null): string[] {
  return [...new Set(parseCommaList(param).map((l) => l.toLowerCase()))].filter((l) => !!LEAGUE_MAP[l]).sort();
}

const { GET, cache } = cachedProxyRoute<{ teams: TeamOption[] }>({
  auth: 'session',
  ttlMs: ROSTER_TTL_MS,
  cacheKey: (req) => parseLeagues(req.nextUrl.searchParams.get('leagues')).join(','),
  execute: async (req) => {
    const leagues = parseLeagues(req.nextUrl.searchParams.get('leagues'));
    if (leagues.length === 0) {
      return NextResponse.json({ error: 'No known league given' }, { status: 400 });
    }
    const rosters = await Promise.all(leagues.map(rosterFor));
    return { teams: rosters.flat() };
  },
  errorMessage: 'Failed to fetch teams',
});

/** @internal */
export { GET, cache };
