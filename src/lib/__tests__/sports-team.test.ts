import { describe, it, expect } from 'vitest';
import type { Game } from '../espn';
import { pickFeaturedGame } from '../sports-team';

function game(id: string, state: Game['state'], startTime: string): Game {
  return {
    id, league: 'NFL', homeTeam: '', awayTeam: '', homeTeamAbbr: 'MIN', awayTeamAbbr: 'GB',
    homeTeamLogo: '', awayTeamLogo: '', homeTeamColor: '', awayTeamColor: '',
    homeScore: 0, awayScore: 0, homeRecord: '', awayRecord: '', status: '', detail: '',
    state, startTime, broadcast: '',
  };
}

describe('pickFeaturedGame', () => {
  const season = [
    game('w1', 'post', '2026-09-13T17:00Z'),
    game('w2', 'post', '2026-09-20T17:00Z'),
    game('w3', 'pre', '2026-10-04T20:05Z'),
    game('w4', 'pre', '2026-10-11T17:00Z'),
  ];

  it('features the next scheduled game and reports the latest finished one as last', () => {
    const pick = pickFeaturedGame(season);
    expect(pick.featuredKind).toBe('next');
    expect(pick.featured?.id).toBe('w3');
    expect(pick.last?.id).toBe('w2');
  });

  it('a live game wins over the upcoming ones regardless of input order', () => {
    const pick = pickFeaturedGame([...season, game('live', 'in', '2026-09-27T17:00Z')]);
    expect(pick.featuredKind).toBe('live');
    expect(pick.featured?.id).toBe('live');
    expect(pick.last?.id).toBe('w2');
  });

  it('a bye week is just a later next game', () => {
    const pick = pickFeaturedGame([season[0], season[1], season[3]]);
    expect(pick.featured?.id).toBe('w4');
  });

  it('with the season over the last result moves up and nothing is left for the footer', () => {
    const pick = pickFeaturedGame([season[1], season[0]]);
    expect(pick.featuredKind).toBe('last');
    expect(pick.featured?.id).toBe('w2');
    expect(pick.last).toBeNull();
  });

  it('an empty schedule yields nothing', () => {
    expect(pickFeaturedGame([])).toEqual({ featured: null, featuredKind: null, last: null });
  });
});
