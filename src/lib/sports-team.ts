/**
 * Which of a team's games the Team view features. Pure over the route's
 * `Game` rows so the rule is testable without ESPN.
 */
import type { Game } from './espn';

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
