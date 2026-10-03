export { TeamLogo } from '../shared/TeamLogo';

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
  game: { state: string; homeScore: number; awayScore: number },
  side: 'home' | 'away',
): boolean {
  if (game.state !== 'post') return false;
  return side === 'home' ? game.homeScore > game.awayScore : game.awayScore > game.homeScore;
}

export function formatScore(game: { state: string }, score: number): string {
  return game.state === 'pre' ? '–' : String(score);
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
