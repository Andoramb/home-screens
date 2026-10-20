export { TeamLogo } from '../shared/TeamLogo';
import { PaginationDots } from '../shared/PaginationDots';

/**
 * The favorite marker: a thin strip in the favorite team's own color along
 * the left edge of a row, card or frame. Parents reserve the gutter on every
 * row once any favorite exists (see FAVORITE_GUTTER) so text never shifts.
 */
export function FavoriteBar({ color, inset = '12%' }: { color: string | null; inset?: string }) {
  if (!color) return null;
  return (
    <span
      data-testid="favorite-bar"
      className="absolute left-0 w-[3px] rounded-full"
      style={{ top: inset, bottom: inset, backgroundColor: `#${color}` }}
    />
  );
}

/** AP poll rank in front of a college team's abbreviation, the way a broadcast prints it. */
export function RankTag({ rank, className = 'text-current/45' }: { rank?: number; className?: string }) {
  if (!rank) return null;
  return (
    <span className={`font-semibold tabular-nums shrink-0 ${className}`} style={{ fontSize: '0.7em' }} data-testid="ap-rank">
      #{rank}
    </span>
  );
}

/** Left padding that makes room for FavoriteBar: the strip plus a small gap. */
export const FAVORITE_GUTTER = '9px';

/** Formats a scheduled game's kickoff for the display (null = no usable instant). */
export type KickoffFn = (game: { startTime: string }) => string | null;

export function isWinner(
  game: { state: string; homeScore: number | null; awayScore: number | null },
  side: 'home' | 'away',
): boolean {
  if (game.state !== 'post' || game.homeScore === null || game.awayScore === null) return false;
  return side === 'home' ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
}

/** A dash before kickoff, and for a score ESPN left out, rather than a made-up 0. */
export function formatScore(game: { state: string }, score: number | null): string {
  return game.state === 'pre' || score === null ? '–' : String(score);
}

/**
 * Status slot of a game row. Scheduled games show the kickoff label the
 * module formatted in the display's timezone (see kickoff.ts); in-progress
 * and final games keep ESPN's status word (clock / "Final").
 */
export function GameStatus({
  state,
  kickoff,
  status,
  dotSize = 'w-1.5 h-1.5',
  fontSize,
  gap = 'gap-1',
  liveColor = 'text-green-400',
  postColor = 'text-current/40',
  preColor = 'text-current/60',
}: {
  state: string;
  kickoff?: string | null;
  status: string;
  dotSize?: string;
  fontSize?: string;
  gap?: string;
  liveColor?: string;
  postColor?: string;
  preColor?: string;
}) {
  return (
    <div className={`flex items-center ${gap}`} style={fontSize ? { fontSize } : undefined}>
      {state === 'in' && (
        <span className={`${dotSize} rounded-full bg-green-400 animate-pulse`} />
      )}
      <span
        className={
          state === 'in'
            ? liveColor
            : state === 'post'
              ? postColor
              : preColor
        }
      >
        {(state === 'pre' && kickoff) || status}
      </span>
    </div>
  );
}

/**
 * The measure key for a paged games view: what changes a row's height or the
 * set of rows. Scores and clocks are left out on purpose, since a refresh
 * that only moved a score must not send the view back to page one.
 */
export function gamePagesKey(games: { id: string }[], favorites: string[], fontSize: number): string {
  return `${games.map((g) => g.id).join(',')}|${favorites.length > 0}|${fontSize}`;
}

/**
 * The page counter under a paged games view. Reserved (empty) during the
 * measuring pass so the rows are measured against the box they will get,
 * and gone when everything fits on one page.
 */
export function GamePagesFooter({ pages, index }: { pages: number[][] | null; index: number }) {
  const count = pages?.length ?? 0;
  if (pages !== null && count <= 1) return null;
  return (
    <div className="flex justify-end shrink-0" style={{ minHeight: '0.6em' }} data-game-pages-footer>
      <PaginationDots total={count} current={index} threshold={8} />
    </div>
  );
}
