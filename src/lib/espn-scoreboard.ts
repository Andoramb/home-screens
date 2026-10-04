/**
 * Server-side scoreboard read shared by /api/sports (every view but Team)
 * and /api/sports/team, which takes a live game's score from here when the
 * team schedule leaves it out.
 */
import { fetchWithTimeout } from './api-utils';
import { parseESPNEvent, scoreboardUrl } from './espn';
import type { Game } from './espn';

/** One league's games from ESPN's scoreboard; empty for an unknown league. */
export async function fetchScoreboard(league: string): Promise<Game[]> {
  const url = scoreboardUrl(league);
  if (!url) return [];

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Failed to fetch ${league} scores`);

  const data = await res.json();
  const events = (data.events ?? []) as Record<string, unknown>[];
  return events.map((event) => parseESPNEvent(event, league));
}
