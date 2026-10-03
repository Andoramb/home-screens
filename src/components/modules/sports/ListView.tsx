import type { Game } from '@/lib/espn';
import { leagueWallCode } from '@/lib/espn';
import { favoriteSide } from '@/lib/sports-order';
import { TeamLogo, isWinner, formatScore, GameStatus, FavoriteBar, FAVORITE_GUTTER, type KickoffFn } from './shared';

export function ListView({ games, kickoff, favorites = [] }: { games: Game[]; kickoff: KickoffFn; favorites?: string[] }) {
  const gutter = favorites.length > 0;
  // `safe center`: centered when the games fit, pinned to the top when they
  // overflow, so the favorites that were sorted first stay on screen on a
  // 60-game Saturday instead of the middle of the list. Cards does the same.
  return (
    <div className="flex flex-col h-full w-full gap-0.5 px-2 overflow-hidden" style={{ justifyContent: 'safe center' }}>
      {games.map((game) => {
        const awayWins = isWinner(game, 'away');
        const homeWins = isWinner(game, 'home');
        const side = favoriteSide(game, favorites);
        const barColor = side === 'away' ? game.awayTeamColor : side === 'home' ? game.homeTeamColor : null;

        return (
          <div
            key={game.id}
            className="relative flex items-center gap-2 py-1 border-b border-white/5 last:border-0"
            style={gutter ? { paddingLeft: FAVORITE_GUTTER } : undefined}
          >
            <FavoriteBar color={barColor} inset="18%" />
            <span
              className="font-bold uppercase tracking-wider text-current/30 shrink-0 whitespace-nowrap"
              style={{ fontSize: '0.55em', minWidth: '2em' }}
            >
              {leagueWallCode(game.league)}
            </span>

            <div className="flex items-center gap-1 min-w-0" style={{ width: '35%' }}>
              <TeamLogo src={game.awayTeamLogo} alt={game.awayTeamAbbr} size={16} />
              <span
                className={`font-semibold truncate ${awayWins ? 'text-current' : 'text-current/70'}`}
                style={{ fontSize: '0.8em' }}
              >
                {game.awayTeamAbbr}
              </span>
              <span
                className={`font-bold tabular-nums shrink-0 ${awayWins ? 'text-current' : 'text-current/60'}`}
                style={{ fontSize: '0.85em' }}
              >
                {formatScore(game, game.awayScore)}
              </span>
            </div>

            <span className="text-current/20 shrink-0" style={{ fontSize: '0.65em' }}>
              @
            </span>

            <div className="flex items-center gap-1 min-w-0" style={{ width: '35%' }}>
              <TeamLogo src={game.homeTeamLogo} alt={game.homeTeamAbbr} size={16} />
              <span
                className={`font-semibold truncate ${homeWins ? 'text-current' : 'text-current/70'}`}
                style={{ fontSize: '0.8em' }}
              >
                {game.homeTeamAbbr}
              </span>
              <span
                className={`font-bold tabular-nums shrink-0 ${homeWins ? 'text-current' : 'text-current/60'}`}
                style={{ fontSize: '0.85em' }}
              >
                {formatScore(game, game.homeScore)}
              </span>
            </div>

            <div className="shrink-0 ml-auto">
              <GameStatus
                state={game.state}
                kickoff={kickoff(game)}
                status={game.status}
                dotSize="w-1 h-1"
                fontSize="0.55em"
                postColor="text-current/35"
                preColor="text-current/50"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
