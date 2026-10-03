import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { MAX_FAVORITE_TEAMS } from '@/lib/sports-order';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const MIN_TEAM = {
  team: {
    abbreviation: 'MIN', displayName: 'Minnesota Vikings', shortDisplayName: 'Vikings', color: '4f2683',
    logos: [{ href: 'https://a/min.png' }],
    record: { items: [{ summary: '3-0' }] },
    standingSummary: '1st in NFC North',
    rank: 5,
  },
};

const NFL_ROSTER = {
  sports: [{ leagues: [{ teams: [
    { team: { id: '16', abbreviation: 'MIN', displayName: 'Minnesota Vikings', shortDisplayName: 'Vikings', color: '4f2683', logos: [{ href: 'https://a/min.png' }] } },
    { team: { id: '9', abbreviation: 'GB', displayName: 'Green Bay Packers', shortDisplayName: 'Packers', color: '203731', logos: [] } },
  ] }] }],
};

const EPL_ROSTER = {
  sports: [{ leagues: [{ teams: [
    { team: { id: '359', abbreviation: 'ARS', displayName: 'Arsenal', shortDisplayName: 'Arsenal', color: 'ef0107', logos: [] } },
  ] }] }],
};

function event(id: string, date: string, state: 'pre' | 'in' | 'post', away: [string, number], home: [string, number]) {
  return {
    id, date,
    competitions: [{
      status: { type: { description: state === 'post' ? 'Final' : state === 'in' ? 'In Progress' : 'Scheduled', state } },
      venue: { fullName: 'U.S. Bank Stadium' },
      broadcasts: [{ media: { shortName: 'FOX' } }],
      competitors: [
        { homeAway: 'home', score: { value: home[1] }, team: { abbreviation: home[0], displayName: home[0], logos: [{ href: `https://a/${home[0]}.png` }] } },
        { homeAway: 'away', score: { value: away[1] }, team: { abbreviation: away[0], displayName: away[0], logos: [{ href: `https://a/${away[0]}.png` }] } },
      ],
    }],
  };
}

const MIN_SCHEDULE = {
  events: [
    event('1', '2026-09-27T17:00Z', 'post', ['MIN', 23], ['TB', 16]),
    event('2', '2026-10-04T20:05Z', 'pre', ['MIA', 0], ['MIN', 0]),
    event('3', '2026-10-11T17:00Z', 'pre', ['MIN', 0], ['NO', 0]),
  ],
};

function mockFetch(byUrl: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    for (const [pattern, body] of Object.entries(byUrl)) {
      if (url.endsWith(pattern)) return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  }));
}

function fetchedUrls(): string[] {
  return (fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
}

describe('GET /api/sports/team', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('addresses the team by its ESPN id from the roster and builds the card from both endpoints', async () => {
    mockFetch({ 'football/nfl/teams?limit=1000': NFL_ROSTER, 'teams/16/schedule': MIN_SCHEDULE, 'teams/16': MIN_TEAM });
    const { GET } = await import('../route');
    const res = await GET(new NextRequest('http://localhost/api/sports/team?teams=nfl:MIN'));
    const json = await res.json();
    expect(json.cards).toHaveLength(1);
    const card = json.cards[0];
    expect(card).toMatchObject({
      key: 'nfl:MIN', league: 'NFL', abbr: 'MIN', name: 'Minnesota Vikings', record: '3-0', standing: '1st in NFC North',
      color: '4f2683', logo: 'https://a/min.png', featuredKind: 'next', rank: 5,
    });
    expect(card.featured).toMatchObject({ id: '2', awayTeamAbbr: 'MIA', homeTeamAbbr: 'MIN', venue: 'U.S. Bank Stadium', broadcast: 'FOX', homeTeamLogo: 'https://a/MIN.png' });
    expect(card.last).toMatchObject({ id: '1', awayScore: 23, homeScore: 16 });
    expect(fetchedUrls().some((u) => u.endsWith('/football/nfl/teams/16'))).toBe(true);
    expect(fetchedUrls().some((u) => u.endsWith('/football/nfl/teams/16/schedule'))).toBe(true);
  });

  it('falls back to the abbreviation when the roster cannot be read', async () => {
    mockFetch({ 'teams/min/schedule': MIN_SCHEDULE, 'teams/min': MIN_TEAM });
    const { GET } = await import('../route');
    const res = await GET(new NextRequest('http://localhost/api/sports/team?teams=nfl:MIN'));
    const json = await res.json();
    expect(json.cards[0]).toMatchObject({ name: 'Minnesota Vikings', featuredKind: 'next' });
  });

  it('merges soccer fixtures into the finished matches, so an upcoming match is featured', async () => {
    const results = { events: [event('r1', '2026-09-28T15:00Z', 'post', ['ARS', 2], ['NEW', 1])] };
    const fixtures = { events: [event('f1', '2026-10-04T14:00Z', 'pre', ['WHU', 0], ['ARS', 0]), event('r1', '2026-09-28T15:00Z', 'post', ['ARS', 2], ['NEW', 1])] };
    mockFetch({
      'soccer/eng.1/teams?limit=1000': EPL_ROSTER,
      'teams/359/schedule': results,
      'teams/359/schedule?fixture=true': fixtures,
      'teams/359': { team: { abbreviation: 'ARS', displayName: 'Arsenal', record: { items: [{ summary: '5-1-1' }] } } },
    });
    const { GET } = await import('../route');
    const json = await (await GET(new NextRequest('http://localhost/api/sports/team?teams=epl:ARS'))).json();
    expect(json.cards[0].featuredKind).toBe('next');
    expect(json.cards[0].featured.id).toBe('f1');
    expect(json.cards[0].last.id).toBe('r1');
    // The NFL path never asks for fixtures.
    expect(fetchedUrls().filter((u) => u.includes('fixture=true'))).toHaveLength(1);
  });

  it('falls back to the regular season when the current phase has no games', async () => {
    const regular = { events: [event('g162', '2026-09-28T18:00Z', 'post', ['MIN', 4], ['PHI', 1])] };
    mockFetch({
      'baseball/mlb/teams?limit=1000': { sports: [{ leagues: [{ teams: [{ team: { id: '9', abbreviation: 'MIN', displayName: 'Minnesota Twins' } }] }] }] },
      'teams/9/schedule': { events: [] },
      'teams/9/schedule?seasontype=2': regular,
      'teams/9': { team: { abbreviation: 'MIN', displayName: 'Minnesota Twins' } },
    });
    const { GET } = await import('../route');
    const json = await (await GET(new NextRequest('http://localhost/api/sports/team?teams=mlb:MIN'))).json();
    expect(json.cards[0].featuredKind).toBe('last');
    expect(json.cards[0].featured.id).toBe('g162');
  });

  it('keeps the header and flags the card when the schedule call fails', async () => {
    mockFetch({ 'football/nfl/teams?limit=1000': NFL_ROSTER, 'teams/16': MIN_TEAM });
    const { GET } = await import('../route');
    const json = await (await GET(new NextRequest('http://localhost/api/sports/team?teams=nfl:MIN'))).json();
    expect(json.cards[0]).toMatchObject({ name: 'Minnesota Vikings', error: true, featured: null });
  });

  it('one failing team does not fail the batch, and duplicates and unknown leagues are dropped', async () => {
    mockFetch({ 'football/nfl/teams?limit=1000': NFL_ROSTER, 'teams/16/schedule': MIN_SCHEDULE, 'teams/16': MIN_TEAM });
    const { GET } = await import('../route');
    const json = await (await GET(new NextRequest('http://localhost/api/sports/team?teams=nfl:MIN,nfl:min,nfl:ZZZ,xfl:MIN'))).json();
    expect(json.cards.map((c: { key: string; error?: boolean }) => [c.key, !!c.error])).toEqual([['nfl:MIN', false], ['nfl:ZZZ', true]]);
  });

  it('answers in request order, including from the cache', async () => {
    mockFetch({ 'football/nfl/teams?limit=1000': NFL_ROSTER, 'teams/16/schedule': MIN_SCHEDULE, 'teams/16': MIN_TEAM, 'teams/9/schedule': { events: [] }, 'teams/9': { team: { abbreviation: 'GB', displayName: 'Green Bay Packers' } } });
    const { GET } = await import('../route');
    const first = await (await GET(new NextRequest('http://localhost/api/sports/team?teams=nfl:MIN,nfl:GB'))).json();
    const second = await (await GET(new NextRequest('http://localhost/api/sports/team?teams=nfl:GB,nfl:MIN'))).json();
    expect(first.cards.map((c: { key: string }) => c.key)).toEqual(['nfl:MIN', 'nfl:GB']);
    expect(second.cards.map((c: { key: string }) => c.key)).toEqual(['nfl:GB', 'nfl:MIN']);
  });

  it('rejects an empty list and more than the cap', async () => {
    mockFetch({});
    const { GET } = await import('../route');
    expect((await GET(new NextRequest('http://localhost/api/sports/team'))).status).toBe(400);
    const many = Array.from({ length: MAX_FAVORITE_TEAMS + 1 }, (_, i) => `nfl:T${i}`).join(',');
    expect((await GET(new NextRequest(`http://localhost/api/sports/team?teams=${many}`))).status).toBe(400);
  });
});
