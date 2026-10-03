/**
 * Ordering rules for the sports module. Favorites are `<league>:<ABBR>`
 * keys from the module config; games are the route's `Game` rows. Pure so
 * the wall, the editor preview and the tests agree.
 */
import type { Game } from './espn';

/**
 * How many favorites the Team view fetches cards for. The route refuses
 * more, the picker stops offering teams at this count, and the fetch URL
 * takes the first eight of an older, longer list.
 */
export const MAX_FAVORITE_TEAMS = 8;

/** Build the config key for a team: `nfl:MIN`, `ncaaf:MINN`. */
export function teamKey(league: string, abbr: string): string {
  return `${league.toLowerCase()}:${abbr.toUpperCase()}`;
}

/** Split a key into its parts, or null for anything malformed. */
export function parseTeamKey(key: string): { league: string; abbr: string } | null {
  const i = key.indexOf(':');
  if (i <= 0 || i === key.length - 1) return null;
  return { league: key.slice(0, i).toLowerCase(), abbr: key.slice(i + 1).toUpperCase() };
}

/** Position of the earliest favorite in this game, or -1 when none plays. */
export function favoriteRank(game: Game, favorites: readonly string[]): number {
  const league = game.league.toLowerCase();
  const home = game.homeTeamAbbr.toUpperCase();
  const away = game.awayTeamAbbr.toUpperCase();
  for (let i = 0; i < favorites.length; i++) {
    const parsed = parseTeamKey(favorites[i]);
    if (!parsed || parsed.league !== league) continue;
    if (parsed.abbr === home || parsed.abbr === away) return i;
  }
  return -1;
}

export function isFavoriteGame(game: Game, favorites: readonly string[]): boolean {
  return favoriteRank(game, favorites) >= 0;
}

/**
 * Which side of a favorite game is ours, for the marker color. When both
 * sides are favorites the away team wins, matching the top row.
 */
export function favoriteSide(game: Game, favorites: readonly string[]): 'home' | 'away' | null {
  const league = game.league.toLowerCase();
  const keys = favorites.map(parseTeamKey).filter((k): k is { league: string; abbr: string } => !!k && k.league === league);
  if (keys.some((k) => k.abbr === game.awayTeamAbbr.toUpperCase())) return 'away';
  if (keys.some((k) => k.abbr === game.homeTeamAbbr.toUpperCase())) return 'home';
  return null;
}

/**
 * Favorite games first, in the order the favorites are listed; everything
 * else keeps ESPN's order. `favoritesOnly` drops the rest. With no
 * favorites the input comes back unchanged.
 */
export function orderGames(games: readonly Game[], favorites: readonly string[] = [], favoritesOnly = false): Game[] {
  if (favorites.length === 0) return [...games];
  const ranked = games.map((game, index) => ({ game, index, rank: favoriteRank(game, favorites) }));
  const first = ranked
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((r) => r.game);
  if (favoritesOnly) return first;
  return [...first, ...ranked.filter((r) => r.rank < 0).map((r) => r.game)];
}
