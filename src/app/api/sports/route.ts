import { cachedProxyRoute, fetchWithTimeout, parseCommaList } from '@/lib/api-utils';
import { scoreboardUrl, parseESPNEvent } from '@/lib/espn';
import type { Game } from '@/lib/espn';

export const dynamic = 'force-dynamic';

async function fetchLeague(league: string): Promise<Game[]> {
  const url = scoreboardUrl(league);
  if (!url) return [];

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Failed to fetch ${league} scores`);

  const data = await res.json();
  const events = (data.events ?? []) as Record<string, unknown>[];
  return events.map((event) => parseESPNEvent(event, league));
}

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

    const results = await Promise.all(leagues.map(fetchLeague));
    const games = results.flat();
    return { games };
  },
  errorMessage: 'Failed to fetch sports scores',
});

/** @internal */
export { GET, cache };
