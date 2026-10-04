/**
 * Which of a team's games the Team view features, and how a score the team
 * schedule left out is filled from the scoreboard. Pure over the route's
 * `Game` rows so the rules are testable without ESPN.
 */
import type { Game, TeamCard } from './espn';

export interface FeaturedPick {
  featured: Game | null;
  featuredKind: 'live' | 'next' | 'last' | null;
  last: Game | null;
}

/**
 * A live game wins; otherwise the next scheduled one; otherwise (season
 * over) the latest finished game moves up. `last` is the latest finished
 * game whenever it is not already the featured one.
 */
export function pickFeaturedGame(games: readonly Game[]): FeaturedPick {
  const byStart = (a: Game, b: Game) => a.startTime.localeCompare(b.startTime);
  const live = games.filter((g) => g.state === 'in').sort(byStart);
  const upcoming = games.filter((g) => g.state === 'pre').sort(byStart);
  const finished = games.filter((g) => g.state === 'post').sort(byStart);
  const last = finished.length ? finished[finished.length - 1] : null;

  if (live.length) return { featured: live[0], featuredKind: 'live', last };
  if (upcoming.length) return { featured: upcoming[0], featuredKind: 'next', last };
  if (last) return { featured: last, featuredKind: 'last', last: null };
  return { featured: null, featuredKind: null, last: null };
}

/** A game under way or over whose score ESPN's team schedule left out. */
export function isMissingScore(game: Game | null): boolean {
  return !!game && game.state !== 'pre' && (game.homeScore === null || game.awayScore === null);
}

/**
 * The upper-cased leagues whose scoreboard holds a score some card is
 * missing, so each is read once however many favorites play in it.
 */
export function leaguesMissingScores(cards: readonly TeamCard[]): string[] {
  const leagues = cards
    .filter((card) => isMissingScore(card.featured) || isMissingScore(card.last))
    .map((card) => card.league);
  return [...new Set(leagues)];
}

/**
 * Fill each card's missing scores, and blank records, from the same event on
 * its league's scoreboard (keyed by upper-cased league). ESPN's team schedule
 * sometimes drops `score` from a game in progress while the scoreboard still
 * carries it. A score neither has stays null.
 */
export function fillMissingScores(cards: readonly TeamCard[], scoreboards: ReadonlyMap<string, readonly Game[]>): TeamCard[] {
  const fill = (game: Game | null, board: readonly Game[]): Game | null => {
    if (!game || !isMissingScore(game)) return game;
    const match = board.find((g) => g.id === game.id);
    if (!match) return game;
    return {
      ...game,
      homeScore: game.homeScore ?? match.homeScore,
      awayScore: game.awayScore ?? match.awayScore,
      homeRecord: game.homeRecord || match.homeRecord,
      awayRecord: game.awayRecord || match.awayRecord,
    };
  };
  return cards.map((card) => {
    const board = scoreboards.get(card.league);
    if (!board?.length) return card;
    return { ...card, featured: fill(card.featured, board), last: fill(card.last, board) };
  });
}
