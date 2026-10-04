import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireDisplayAuth: vi.fn(),
  requireSession: vi.fn(),
  isAuthEnabled: vi.fn().mockResolvedValue(false),
}));

const NFL_TEAMS = {
  sports: [{ leagues: [{ teams: [
    { team: { id: '16', abbreviation: 'MIN', displayName: 'Minnesota Vikings', shortDisplayName: 'Vikings', color: '4f2683', logos: [{ href: 'https://a/min.png' }] } },
    { team: { abbreviation: 'GB', displayName: 'Green Bay Packers', shortDisplayName: 'Packers', color: '203731', logos: [{ href: 'https://a/gb.png' }] } },
  ] }] }],
};

const CFB_TEAMS = {
  sports: [{ leagues: [{ teams: [
    { team: { abbreviation: 'MINN', displayName: 'Minnesota Golden Gophers', color: '5e0a2f', logos: [] } },
    { team: { abbreviation: 'ACU', displayName: 'Abilene Christian Wildcats', color: '592d82', logos: [] } },
  ] }] }],
};

const CFB_STANDINGS = {
  children: [
    { name: 'Big Ten Conference', standings: { entries: [
      { team: { id: '135', abbreviation: 'MINN', displayName: 'Minnesota Golden Gophers', shortDisplayName: 'Golden Gophers', logos: [{ href: 'https://a/minn.png' }] } },
      { team: { abbreviation: 'MICH', displayName: 'Michigan Wolverines', logos: [] } },
    ] } },
  ],
};

function mockFetch(byUrl: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    for (const [pattern, body] of Object.entries(byUrl)) {
      if (url.includes(pattern)) return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  }));
}

describe('GET /api/sports/teams', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('answers a pro league from the teams endpoint, sorted by name and tagged with the league', async () => {
    mockFetch({ 'football/nfl/teams': NFL_TEAMS });
    const { GET } = await import('../route');
    const res = await GET(new NextRequest('http://localhost/api/sports/teams?leagues=nfl'));
    const json = await res.json();
    expect(json.teams.map((t: { abbr: string }) => t.abbr)).toEqual(['GB', 'MIN']);
    expect(json.teams[1]).toMatchObject({ league: 'nfl', id: '16', name: 'Minnesota Vikings', shortName: 'Vikings', logo: 'https://a/min.png', color: '4f2683' });
  });

  it('answers college football from the FBS standings, with colors merged from the teams endpoint', async () => {
    mockFetch({ 'college-football/standings': CFB_STANDINGS, 'college-football/teams': CFB_TEAMS });
    const { GET } = await import('../route');
    const res = await GET(new NextRequest('http://localhost/api/sports/teams?leagues=ncaaf'));
    const json = await res.json();
    // Abilene Christian is not FBS and must not appear.
    expect(json.teams.map((t: { abbr: string }) => t.abbr)).toEqual(['MICH', 'MINN']);
    expect(json.teams[1]).toMatchObject({ league: 'ncaaf', id: '135', color: '5e0a2f', logo: 'https://a/minn.png' });
  });

  it('merges several leagues into one answer and ignores unknown ones', async () => {
    mockFetch({ 'football/nfl/teams': NFL_TEAMS, 'college-football/standings': CFB_STANDINGS, 'college-football/teams': CFB_TEAMS });
    const { GET } = await import('../route');
    const res = await GET(new NextRequest('http://localhost/api/sports/teams?leagues=ncaaf,nfl,xfl'));
    const json = await res.json();
    expect(json.teams.map((t: { league: string; abbr: string }) => `${t.league}:${t.abbr}`)).toEqual(['ncaaf:MICH', 'ncaaf:MINN', 'nfl:GB', 'nfl:MIN']);
  });

  it('rejects a request with no known league', async () => {
    mockFetch({});
    const { GET } = await import('../route');
    const res = await GET(new NextRequest('http://localhost/api/sports/teams?leagues=xfl'));
    expect(res.status).toBe(400);
  });
});
