import { describe, it, expect } from 'vitest';
import type { Game } from '../espn';
import { favoriteRank, favoriteSide, isFavoriteGame, isFavoriteTeam, orderGames, parseTeamKey, teamKey } from '../sports-order';

function game(id: string, league: string, away: string, home: string): Game {
  return {
    id, league, homeTeam: home, awayTeam: away, homeTeamAbbr: home, awayTeamAbbr: away,
    homeTeamLogo: '', awayTeamLogo: '', homeTeamColor: 'aaaaaa', awayTeamColor: 'bbbbbb',
    homeScore: 0, awayScore: 0, homeRecord: '', awayRecord: '', status: 'Scheduled', detail: '',
    state: 'pre', startTime: '2026-10-04T17:00:00Z', broadcast: '',
  };
}

const GAMES = [
  game('1', 'NFL', 'BUF', 'MIA'),
  game('2', 'NCAAF', 'MICH', 'MINN'),
  game('3', 'NFL', 'MIA', 'MIN'),
  game('4', 'NFL', 'GB', 'CHI'),
];

describe('teamKey / parseTeamKey', () => {
  it('normalizes case both ways', () => {
    expect(teamKey('NFL', 'min')).toBe('nfl:MIN');
    expect(parseTeamKey('NFL:min')).toEqual({ league: 'nfl', abbr: 'MIN' });
  });

  it('rejects malformed keys', () => {
    expect(parseTeamKey('MIN')).toBeNull();
    expect(parseTeamKey(':MIN')).toBeNull();
    expect(parseTeamKey('nfl:')).toBeNull();
  });
});

describe('orderGames', () => {
  it('returns the input order with no favorites', () => {
    expect(orderGames(GAMES).map((g) => g.id)).toEqual(['1', '2', '3', '4']);
  });

  it('puts favorite games first in favorites-list order, the rest untouched', () => {
    const out = orderGames(GAMES, ['ncaaf:MINN', 'nfl:MIN']);
    expect(out.map((g) => g.id)).toEqual(['2', '3', '1', '4']);
  });

  it('matches the league part, so MIN in the NFL does not pull a college MINN game', () => {
    expect(orderGames(GAMES, ['nfl:MINN']).map((g) => g.id)).toEqual(['1', '2', '3', '4']);
  });

  it('keeps every game of a team that plays twice, in schedule order', () => {
    const twice = [...GAMES, game('5', 'NFL', 'MIN', 'DET')];
    expect(orderGames(twice, ['nfl:MIN']).map((g) => g.id)).toEqual(['3', '5', '1', '2', '4']);
  });

  it('favoritesOnly keeps only the favorites, and an empty match returns nothing', () => {
    expect(orderGames(GAMES, ['nfl:MIN'], true).map((g) => g.id)).toEqual(['3']);
    expect(orderGames(GAMES, ['nhl:MIN'], true)).toEqual([]);
  });

  it('a game with two favorites sorts by the earlier favorite', () => {
    const out = orderGames(GAMES, ['nfl:CHI', 'nfl:MIA', 'nfl:BUF']);
    // Game 1 (BUF at MIA) ranks by MIA (index 1); game 3 (MIA at MIN) also by MIA; game 4 by CHI (0).
    expect(out.map((g) => g.id)).toEqual(['4', '1', '3', '2']);
    expect(favoriteRank(GAMES[0], ['nfl:CHI', 'nfl:MIA', 'nfl:BUF'])).toBe(1);
  });

  it('ignores malformed keys', () => {
    expect(orderGames(GAMES, ['garbage', 'nfl:MIN']).map((g) => g.id)).toEqual(['3', '1', '2', '4']);
  });
});

describe('favoriteSide / isFavoriteGame', () => {
  it('names the side our team is on, away first when both sides are favorites', () => {
    expect(favoriteSide(GAMES[2], ['nfl:MIN'])).toBe('home');
    expect(favoriteSide(GAMES[2], ['nfl:MIA'])).toBe('away');
    expect(favoriteSide(GAMES[2], ['nfl:MIN', 'nfl:MIA'])).toBe('away');
    expect(favoriteSide(GAMES[2], ['nfl:GB'])).toBeNull();
    expect(isFavoriteGame(GAMES[2], ['nfl:min'])).toBe(true);
  });
});

describe('isFavoriteTeam', () => {
  it('matches league and abbreviation in any case, and nothing with an empty list', () => {
    expect(isFavoriteTeam('NFL', 'min', ['nfl:MIN'])).toBe(true);
    expect(isFavoriteTeam('ncaaf', 'MINN', ['nfl:MIN'])).toBe(false);
    expect(isFavoriteTeam('nfl', 'MIN', [])).toBe(false);
    expect(isFavoriteTeam('nfl', 'MIN')).toBe(false);
  });
});
