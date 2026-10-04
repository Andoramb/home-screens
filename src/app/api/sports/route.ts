import { cachedProxyRoute, parseCommaList } from '@/lib/api-utils';
import type { Game } from '@/lib/espn';
import { fetchScoreboard } from '@/lib/espn-scoreboard';

export const dynamic = 'force-dynamic';

const { GET, cache } = cachedProxyRoute<{ games: Game[] }>({
  auth: 'display',
  ttlMs: 60 * 1000, // 1 minute
  cacheKey: (req) => {
    const leaguesParam = req.nextUrl.searchParams.get('leagues') || 'nfl,nba';
    return parseCommaList(leaguesParam).sort().join(',');
  },
  execute: async (req) => {
    const leaguesParam = req.nextUrl.searchParams.get('leagues') || 'nfl,nba';
    const leagues = parseCommaList(leaguesParam);

    const results = await Promise.all(leagues.map(fetchScoreboard));
    const games = results.flat();
    return { games };
  },
  errorMessage: 'Failed to fetch sports scores',
});

/** @internal */
export { GET, cache };
