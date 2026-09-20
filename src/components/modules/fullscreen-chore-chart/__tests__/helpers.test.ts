import { describe, it, expect } from 'vitest';
import {
  getOrientation,
  getUniqueInitials,
  getCurrentTimeOfDay,
  buildChoreRows,
  groupPillMetrics,
  groupPillMinRow,
  groupPillPadY,
  buildMemberRows,
  fitRowHeight,
  fitDotSize,
  fitDotsInRoom,
  shouldStack,
  splitInOrder,
  TOD_ORDER,
  ROW_HEIGHT_CAP,
  ROW_GROWTH,
} from '../helpers';
import type { ResolvedAssignment } from '@/components/modules/chore-chart/types';
import type { ChoreDefinition } from '@/types/config';

function makeChore(overrides: Partial<ChoreDefinition> & { id: string; name: string }): ChoreDefinition {
  return {
    emoji: '',
    frequency: 'daily',
    daysOfWeek: [],
    timeOfDay: 'morning',
    assigneeIds: [],
    rotation: 'fixed',
    points: 1,
    ...overrides,
  };
}

function makeAssignment(
  chore: ChoreDefinition,
  memberId: string,
  isCompleted = false,
): ResolvedAssignment {
  return { chore, memberId, isCompleted, groupIds: chore.assigneeGroupIds ?? [] };
}

describe('getOrientation', () => {
  it('returns portrait when height > width', () => {
    expect(getOrientation(1080, 1920)).toBe('portrait');
  });

  it('returns landscape when width >= height', () => {
    expect(getOrientation(1920, 1080)).toBe('landscape');
  });

  it('returns landscape when width equals height', () => {
    expect(getOrientation(1080, 1080)).toBe('landscape');
  });
});

describe('getUniqueInitials', () => {
  it('uses single characters when all first letters are unique', () => {
    const members = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ];
    const result = getUniqueInitials(members);
    expect(result.get('1')).toBe('A');
    expect(result.get('2')).toBe('B');
    expect(result.get('3')).toBe('C');
  });

  it('extends to 2 characters to resolve collisions', () => {
    const members = [
      { id: '1', name: 'Sam' },
      { id: '2', name: 'Sarah' },
      { id: '3', name: 'Bob' },
    ];
    const result = getUniqueInitials(members);
    // B is unique → single char
    expect(result.get('3')).toBe('B');
    // Sam vs Sarah → 'Sa' vs 'Sa' → still collide → extend to 3: 'Sam' vs 'Sar'
    expect(result.get('1')).toBe('Sam');
    expect(result.get('2')).toBe('Sar');
  });

  it('handles single member', () => {
    const result = getUniqueInitials([{ id: '1', name: 'Zoe' }]);
    expect(result.get('1')).toBe('Z');
  });

  it('handles empty list', () => {
    const result = getUniqueInitials([]);
    expect(result.size).toBe(0);
  });

  it('extends to 2 chars only where needed', () => {
    const members = [
      { id: '1', name: 'Dan' },
      { id: '2', name: 'Dave' },
      { id: '3', name: 'Emily' },
    ];
    const result = getUniqueInitials(members);
    expect(result.get('3')).toBe('E'); // unique at 1
    // Dan vs Dave: 'Da' vs 'Da' → collide at 2, resolved at 3
    expect(result.get('1')).toBe('Dan');
    expect(result.get('2')).toBe('Dav');
  });

  it('caps at 3 characters for unresolvable collisions', () => {
    const members = [
      { id: '1', name: 'AAAAAA' },
      { id: '2', name: 'AAAAAB' },
    ];
    const result = getUniqueInitials(members);
    // Both are "AAA" at 3 chars — the remaining get truncated to 3
    expect(result.get('1')).toBe('AAA');
    expect(result.get('2')).toBe('AAA');
  });
});

describe('getCurrentTimeOfDay', () => {
  it('returns morning for hours 0-11', () => {
    expect(getCurrentTimeOfDay(0)).toBe('morning');
    expect(getCurrentTimeOfDay(6)).toBe('morning');
    expect(getCurrentTimeOfDay(11)).toBe('morning');
  });

  it('returns afternoon for hours 12-16', () => {
    expect(getCurrentTimeOfDay(12)).toBe('afternoon');
    expect(getCurrentTimeOfDay(14)).toBe('afternoon');
    expect(getCurrentTimeOfDay(16)).toBe('afternoon');
  });

  it('returns evening for hours 17-23', () => {
    expect(getCurrentTimeOfDay(17)).toBe('evening');
    expect(getCurrentTimeOfDay(20)).toBe('evening');
    expect(getCurrentTimeOfDay(23)).toBe('evening');
  });

  it('returns null for hour >= 24', () => {
    expect(getCurrentTimeOfDay(24)).toBeNull();
  });
});

describe('TOD_ORDER', () => {
  it('defines the correct ordering', () => {
    expect(TOD_ORDER).toEqual(['morning', 'afternoon', 'evening', 'anytime']);
  });
});

describe('buildChoreRows', () => {
  it('deduplicates a chore assigned to multiple members into one row', () => {
    const chore = makeChore({ id: 'dishes', name: 'Dishes', timeOfDay: 'evening' });
    const assignments: ResolvedAssignment[] = [
      makeAssignment(chore, 'alice', false),
      makeAssignment(chore, 'bob', true),
    ];

    const result = buildChoreRows(assignments);
    const eveningRows = result.get('evening')!;
    expect(eveningRows).toHaveLength(1);
    expect(eveningRows[0].choreId).toBe('dishes');
    expect(eveningRows[0].assignees).toHaveLength(2);
  });

  it('groups chores by time of day', () => {
    const morning = makeChore({ id: 'beds', name: 'Make Beds', timeOfDay: 'morning' });
    const evening = makeChore({ id: 'teeth', name: 'Brush Teeth', timeOfDay: 'evening' });
    const assignments: ResolvedAssignment[] = [
      makeAssignment(morning, 'alice'),
      makeAssignment(evening, 'bob'),
    ];

    const result = buildChoreRows(assignments);
    expect(result.get('morning')).toHaveLength(1);
    expect(result.get('evening')).toHaveLength(1);
    expect(result.has('afternoon')).toBe(false);
  });

  it('keeps assignees in household order whatever their state', () => {
    const chore = makeChore({ id: 'clean', name: 'Clean', timeOfDay: 'anytime' });
    const assignments: ResolvedAssignment[] = [
      makeAssignment(chore, 'charlie', false),
      makeAssignment(chore, 'bob', true),
      makeAssignment(chore, 'alice', false),
    ];
    const order = new Map([['alice', 0], ['bob', 1], ['charlie', 2]]);

    const row = buildChoreRows(assignments, order).get('anytime')![0];
    // A kid's ring stays in the same column when someone else finishes.
    expect(row.assignees.map((a) => a.memberId)).toEqual(['alice', 'bob', 'charlie']);
    expect(row.assignees[1].isCompleted).toBe(true);
  });

  it('preserves chore metadata (emoji, points)', () => {
    const chore = makeChore({ id: 'feed', name: 'Feed Cat', emoji: '🐱', points: 5, timeOfDay: 'morning' });
    const result = buildChoreRows([makeAssignment(chore, 'alice')]);
    const row = result.get('morning')![0];
    expect(row.choreEmoji).toBe('🐱');
    expect(row.points).toBe(5);
    expect(row.choreName).toBe('Feed Cat');
  });

  it('handles empty assignments', () => {
    const result = buildChoreRows([]);
    expect(result.size).toBe(0);
  });

  it('keeps distinct chores in same time slot as separate rows', () => {
    const dishes = makeChore({ id: 'dishes', name: 'Dishes', timeOfDay: 'evening' });
    const trash = makeChore({ id: 'trash', name: 'Trash', timeOfDay: 'evening' });
    const assignments: ResolvedAssignment[] = [
      makeAssignment(dishes, 'alice'),
      makeAssignment(trash, 'bob'),
    ];

    const result = buildChoreRows(assignments);
    expect(result.get('evening')).toHaveLength(2);
  });
});

describe('fitRowHeight', () => {
  it('shares what the headers leave between the rows', () => {
    // 9 chores under 3 headers of 50px on a 900px list: (900 - 150) / 9 = 83.3px,
    // under the cozy cap of 70 x 1.2 = 84px.
    expect(fitRowHeight({ listHeight: 900, chores: 9, fixed: 150, k: 1, typoMul: 1 })).toBeCloseTo(750 / 9, 3);
  });

  it('caps a light day at typography plus headroom and floors a heavy one', () => {
    const cap = ROW_HEIGHT_CAP * 1.2 * 1.35 * ROW_GROWTH;
    expect(fitRowHeight({ listHeight: 1400, chores: 2, fixed: 50, k: 1, typoMul: 1.35 })).toBeCloseTo(cap, 6);
    expect(fitRowHeight({ listHeight: 1400, chores: 40, fixed: 200, k: 1, typoMul: 1.35 })).toBe(56);
  });

  it('scales floor and cap with the canvas but only the cap with typography and density', () => {
    expect(fitRowHeight({ listHeight: 10_000, chores: 1, k: 0.5, typoMul: 2, densityMul: 1 })).toBeCloseTo(70 * 0.5 * 2 * ROW_GROWTH, 6);
    expect(fitRowHeight({ listHeight: 10, chores: 40, k: 0.5, typoMul: 2 })).toBe(28);
  });

  it('returns the cap before the list has been measured', () => {
    expect(fitRowHeight({ listHeight: 0, chores: 9, k: 1, typoMul: 1 })).toBeCloseTo(84, 6);
  });
});

describe('fitDotSize', () => {
  it('is fingertip-sized when the row can hold one and never taller than the row', () => {
    expect(fitDotSize(84, 1)).toBeCloseTo(52.08, 2);
    expect(fitDotSize(56, 1)).toBe(44);
    expect(fitDotSize(37, 0.667)).toBeCloseTo(33.3, 1);
    expect(fitDotSize(200, 1)).toBe(60);
  });
});

describe('fitDotsInRoom', () => {
  it('keeps the requested size when one dot or the dots fit', () => {
    expect(fitDotsInRoom(52, 1, 100)).toBe(52);
    expect(fitDotsInRoom(52, 2, 440)).toBe(52);
  });

  it('shrinks eight dots to share a narrow column', () => {
    const d = fitDotsInRoom(52, 8, 368);
    expect(d).toBeLessThan(52);
    expect(d * 8 + Math.max(d * 0.2, 8) * 7).toBeLessThanOrEqual(368 + 0.01);
  });

  it('never drops below the readable floor', () => {
    expect(fitDotsInRoom(52, 12, 200)).toBe(28);
  });
});

describe('shouldStack', () => {
  it('stacks a column whose widest row would spend over two fifths of the width on dots', () => {
    // Six 52px dots plus gaps = 364px: too much beside a name in a 456px column, fine in a 984px one.
    expect(shouldStack(6, 52, 456)).toBe(true);
    expect(shouldStack(6, 52, 984)).toBe(false);
    expect(shouldStack(1, 52, 200)).toBe(false);
  });
});

describe('splitInOrder', () => {
  it('cuts the sections in order where the columns come out most even', () => {
    const sections = [{ id: 'morning', n: 3 }, { id: 'afternoon', n: 2 }, { id: 'evening', n: 2 }, { id: 'anytime', n: 6 }];
    const cols = splitInOrder(sections, (s) => s.n, 2);
    expect(cols.map((c) => c.map((s) => s.id))).toEqual([['morning', 'afternoon', 'evening'], ['anytime']]);
  });

  it('never splits a section and never reorders', () => {
    const cols = splitInOrder([{ id: 'a', n: 9 }, { id: 'b', n: 1 }, { id: 'c', n: 1 }], (s) => s.n, 2);
    expect(cols.map((c) => c.map((s) => s.id))).toEqual([['a'], ['b', 'c']]);
  });

  it('keeps everything in one column when asked for one', () => {
    expect(splitInOrder([1, 2, 3], () => 1, 1)).toEqual([[1, 2, 3]]);
  });
});

describe('buildMemberRows', () => {
  const members = [
    { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', id: 'a', name: 'Ann', emoji: '', color: '#f00' },
    { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', id: 'b', name: 'Ben', emoji: '', color: '#0f0' },
    { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', id: 'c', name: 'Cal', emoji: '', color: '#00f' },
  ];
  const dishes = makeChore({ id: 'dishes', name: 'Dishes', timeOfDay: 'evening' });
  const bed = makeChore({ id: 'bed', name: 'Make bed', timeOfDay: 'morning' });

  it('gives each member their own rows and never merges a shared chore', () => {
    const rows = buildMemberRows(members, [
      makeAssignment(dishes, 'a'),
      makeAssignment(dishes, 'b', true),
      makeAssignment(bed, 'a'),
    ], true);
    expect([...rows.keys()]).toEqual(['a', 'b']);
    expect(rows.get('a')!.map((r) => r.choreId)).toEqual(['bed', 'dishes']);
    expect(rows.get('a')![0].assignees).toEqual([{ memberId: 'a', isCompleted: false }]);
    expect(rows.get('b')![0].assignees).toEqual([{ memberId: 'b', isCompleted: true }]);
  });

  it('skips members with nothing today', () => {
    const rows = buildMemberRows(members, [makeAssignment(bed, 'c')], true);
    expect(rows.has('a')).toBe(false);
    expect(rows.get('c')).toHaveLength(1);
  });

  it('sorts a member\'s rows by time of day only when asked', () => {
    const rows = buildMemberRows(members, [makeAssignment(dishes, 'a'), makeAssignment(bed, 'a')], false);
    expect(rows.get('a')!.map((r) => r.choreId)).toEqual(['dishes', 'bed']);
  });

  it('keeps a done row where it was so a tap never moves it', () => {
    const rows = buildMemberRows(members, [makeAssignment(bed, 'a', true), makeAssignment(dishes, 'a')], true);
    expect(rows.get('a')!.map((r) => r.choreId)).toEqual(['bed', 'dishes']);
  });
});

describe('buildChoreRows with a family group', () => {
  const stamp = '2026-01-01T00:00:00.000Z';
  const kids = { id: 'kids', name: 'Kids', memberIds: ['ann', 'ben'], createdAt: stamp, updatedAt: stamp };
  const order = new Map([['mom', 0], ['ann', 1], ['ben', 2]]);

  it('labels the row and puts the group first, in household order, with anyone extra after it', () => {
    const chore = makeChore({ id: 'teeth', name: 'Brush teeth', timeOfDay: 'evening', assigneeIds: ['mom'], assigneeGroupIds: ['kids'] });
    const rows = buildChoreRows(['mom', 'ben', 'ann'].map((id) => makeAssignment(chore, id, false)), order, [kids]);
    const row = rows.get('evening')![0];
    expect(row.groupLabel).toBe('Kids');
    expect(row.assignees.map((a) => [a.memberId, !!a.viaGroup])).toEqual([['ann', true], ['ben', true], ['mom', false]]);
  });

  it('leaves a row alone when the chore names people only, or its group is gone', () => {
    const plain = makeChore({ id: 'plain', name: 'Beds', timeOfDay: 'evening', assigneeIds: ['ann', 'mom'] });
    const orphan = makeChore({ id: 'orphan', name: 'Bins', timeOfDay: 'evening', assigneeIds: ['ann'], assigneeGroupIds: ['gone'] });
    const rows = buildChoreRows([makeAssignment(plain, 'ann', false), makeAssignment(plain, 'mom', false), makeAssignment(orphan, 'ann', false)], order, [kids]).get('evening')!;
    expect(rows.map((row) => row.groupLabel)).toEqual([undefined, undefined]);
    expect(rows[0].assignees.map((a) => a.memberId)).toEqual(['mom', 'ann']);
  });

  it('on a schedule, draws the pill only on the days the group has the chore', () => {
    const chore = makeChore({ id: 'dishes', name: 'Dishes', timeOfDay: 'evening', assigneeIds: ['ann'], assigneeGroupIds: ['kids'], rotation: 'schedule', schedule: { ann: [2] }, groupSchedule: { kids: [1] } });
    const ownDay = buildChoreRows([{ ...makeAssignment(chore, 'ann'), groupIds: [] }], order, [kids]).get('evening')![0];
    expect([ownDay.groupLabel, ownDay.assignees[0].viaGroup]).toEqual([undefined, false]);
    const groupDay = buildChoreRows(['ann', 'ben'].map((id) => makeAssignment(chore, id)), order, [kids]).get('evening')![0];
    expect(groupDay.groupLabel).toBe('Kids');
  });

  it('names the first group and counts the rest, so two groups do not make a pill twice as wide', () => {
    const adults = { id: 'adults', name: 'Grown-ups', memberIds: ['mom'], createdAt: stamp, updatedAt: stamp };
    const chore = makeChore({ id: 'tidy', name: 'Tidy up', timeOfDay: 'evening', assigneeIds: [], assigneeGroupIds: ['kids', 'adults'] });
    const row = buildChoreRows(['mom', 'ann'].map((id) => makeAssignment(chore, id, false)), order, [kids, adults]).get('evening')![0];
    expect([row.groupLabel, row.groupExtra]).toEqual(['Kids', 1]);
    expect(row.assignees.every((a) => a.viaGroup)).toBe(true);
  });

  it('stops growing the pill for a very long group name', () => {
    const long = groupPillMetrics('Grandparents, aunts, uncles and cousins', 30, 50).extra;
    expect(long).toBe(groupPillMetrics('Grandparents', 30, 50).extra);
    expect(long).toBeLessThan(groupPillMetrics('Kids', 30, 50).extra * 2.2);
  });

  it('sets aside more width for a longer group name, and stacks sooner for it', () => {
    expect(groupPillMetrics('Grown-ups', 30, 50).extra).toBeGreaterThan(groupPillMetrics('Kids', 30, 50).extra);
    expect(shouldStack(5, 50, 800)).toBe(false);
    expect(shouldStack(5, 50, 800, groupPillMetrics('Grown-ups', 30, 50).extra)).toBe(true);
  });

  // The dense case: a 37.3px row whose ring is 33.6px leaves under 4px, and
  // the pill's full padding and border need about 14.
  it('never lets a pill be taller than its row', () => {
    const name = 20, dot = 33.6;
    const pillHeight = (row: number) => dot + groupPillPadY(name, dot, row) * 2 + 2;
    const tight = groupPillMinRow(name, dot);
    expect(tight).toBeGreaterThan(37.3);
    expect(pillHeight(tight)).toBeLessThanOrEqual(tight);
    // With room to spare the padding stops at its full size rather than filling the row.
    expect(groupPillPadY(name, dot, 200)).toBeCloseTo(name * 0.26);
    expect(groupPillPadY(name, dot, undefined)).toBeCloseTo(name * 0.26);
    // Squeezed, but never to nothing: the rings must not touch the pill's edge.
    expect(groupPillPadY(name, dot, 10)).toBeCloseTo(name * 0.1);
  });
});
