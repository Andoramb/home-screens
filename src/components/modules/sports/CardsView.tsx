import type { Game } from '@/lib/espn';
import { leagueWallCode } from '@/lib/espn';
import { favoriteSide } from '@/lib/sports-order';
import { TeamLogo, isWinner, formatScore, GameStatus, FavoriteBar, RankTag, FAVORITE_GUTTER, type KickoffFn } from './shared';

function GameCard({ game, kickoff, favorites }: { game: Game; kickoff: KickoffFn; favorites: string[] }) {
  const awayWins = isWinner(game, 'away');
  const homeWins = isWinner(game, 'home');
  const side = favoriteSide(game, favorites);
  const barColor = side === 'away' ? game.awayTeamColor : side === 'home' ? game.homeTeamColor : null;

  return (
    <div
      className="relative bg-white/5 rounded-lg p-2.5 flex flex-col gap-1.5"
      style={favorites.length > 0 ? { paddingLeft: `calc(0.625rem + ${FAVORITE_GUTTER})` } : undefined}
    >
      <FavoriteBar color={barColor} inset="14%" />
      <div className="flex items-center justify-between" style={{ fontSize: '0.6em' }}>
        <span className="font-semibold tracking-wider uppercase text-current/40">
          {leagueWallCode(game.league)}
        </span>
        <GameStatus
          state={game.state}
          kickoff={kickoff(game)}
          status={game.status}
          dotSize="w-1 h-1"
          postColor="text-current/35"
          preColor="text-current/50"
        />
      </div>

      <div className="flex items-center gap-2">
        <TeamLogo src={game.awayTeamLogo} alt={game.awayTeamAbbr} size={20} />
        <RankTag rank={game.awayRank} />
        <span
          className={`flex-1 font-semibold truncate ${awayWins ? 'text-current' : 'text-current/70'}`}
          style={{ fontSize: '0.85em' }}
        >
          {game.awayTeamAbbr}
        </span>
        <span
          className={`font-bold tabular-nums ${awayWins ? 'text-current' : 'text-current/60'}`}
          style={{ fontSize: '0.95em' }}
        >
          {formatScore(game, game.awayScore)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <TeamLogo src={game.homeTeamLogo} alt={game.homeTeamAbbr} size={20} />
        <RankTag rank={game.homeRank} />
        <span
          className={`flex-1 font-semibold truncate ${homeWins ? 'text-current' : 'text-current/70'}`}
          style={{ fontSize: '0.85em' }}
        >
          {game.homeTeamAbbr}
        </span>
        <span
          className={`font-bold tabular-nums ${homeWins ? 'text-current' : 'text-current/60'}`}
          style={{ fontSize: '0.95em' }}
        >
          {formatScore(game, game.homeScore)}
        </span>
      </div>
    </div>
  );
}

export function CardsView({ games, kickoff, favorites = [] }: { games: Game[]; kickoff: KickoffFn; favorites?: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 h-full w-full p-2 overflow-hidden" style={{ alignContent: 'safe center' }}>
      {games.map((game) => (
        <GameCard key={game.id} game={game} kickoff={kickoff} favorites={favorites} />
      ))}
    </div>
  );
}
