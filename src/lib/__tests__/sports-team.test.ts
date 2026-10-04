import { describe, it, expect } from 'vitest';
import type { Game, TeamCard } from '../espn';
import { fillMissingScores, isMissingScore, leaguesMissingScores, pickFeaturedGame } from '../sports-team';

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

describe('missing scores', () => {
  const live = (over: Partial<Game> = {}): Game => ({ ...game('401', 'in', '2026-10-03T19:30Z'), league: 'NCAAF', homeTeamAbbr: 'MINN', awayTeamAbbr: 'MICH', homeScore: null, awayScore: null, ...over });
  const card = (key: string, league: string, featured: Game | null, last: Game | null = null): TeamCard => ({
    key, league, abbr: 'MINN', name: '', shortName: '', logo: '', color: '', record: '', standing: '',
    featured, featuredKind: featured ? 'live' : null, last,
  });

  it('only a started or finished game can be missing a score', () => {
    expect(isMissingScore(live())).toBe(true);
    expect(isMissingScore(live({ state: 'post', homeScore: 20 }))).toBe(true);
    expect(isMissingScore(live({ state: 'pre' }))).toBe(false);
    expect(isMissingScore(live({ homeScore: 20, awayScore: 14 }))).toBe(false);
    expect(isMissingScore(null)).toBe(false);
  });

  it('names each league with a missing score once', () => {
    const cards = [
      card('ncaaf:MINN', 'NCAAF', live()),
      card('ncaaf:IOWA', 'NCAAF', null, live({ id: '402', state: 'post' })),
      card('nfl:MIN', 'NFL', live({ league: 'NFL', homeScore: 7, awayScore: 3 })),
    ];
    expect(leaguesMissingScores(cards)).toEqual(['NCAAF']);
  });

  it('fills the scores and blank records from the same event on the scoreboard, and nothing else', () => {
    const board = [
      live({ id: '400', homeScore: 3, awayScore: 0 }),
      live({ homeScore: 20, awayScore: 14, homeRecord: '3-1', awayRecord: '3-2', status: '4th 2:31' }),
    ];
    const [filled] = fillMissingScores([card('ncaaf:MINN', 'NCAAF', live({ awayRecord: '3-2 (2-1)' }))], new Map([['NCAAF', board]]));
    expect(filled.featured).toMatchObject({ id: '401', homeScore: 20, awayScore: 14, homeRecord: '3-1', awayRecord: '3-2 (2-1)', status: '' });
  });

  it('keeps a score the schedule did send, and leaves one neither has null', () => {
    const half = live({ homeScore: 21 });
    const [kept] = fillMissingScores([card('ncaaf:MINN', 'NCAAF', half)], new Map([['NCAAF', [live({ homeScore: 20, awayScore: 14 })]]]));
    expect(kept.featured).toMatchObject({ homeScore: 21, awayScore: 14 });

    const [unmatched] = fillMissingScores([card('ncaaf:MINN', 'NCAAF', live())], new Map([['NCAAF', [live({ id: '999', homeScore: 1, awayScore: 1 })]]]));
    expect(unmatched.featured).toMatchObject({ homeScore: null, awayScore: null });

    const [noBoard] = fillMissingScores([card('ncaaf:MINN', 'NCAAF', live())], new Map());
    expect(noBoard.featured).toMatchObject({ homeScore: null, awayScore: null });
  });

  it('fills a finished last game too', () => {
    const last = live({ id: '402', state: 'post' });
    const [filled] = fillMissingScores(
      [card('ncaaf:MINN', 'NCAAF', null, last)],
      new Map([['NCAAF', [live({ id: '402', state: 'post', homeScore: 27, awayScore: 24 })]]]),
    );
    expect(filled.last).toMatchObject({ homeScore: 27, awayScore: 24 });
  });
});
