import { describe, it, expect } from 'vitest';
import { choreAppliesToday, choreAssigneeIds, choresAssignedTo, resolveAssignee, resolveAssignmentsFor, type ChoreGroup } from '@/lib/chore-assignments';
import type { ChoreDefinition } from '@/types/config';
import type { FamilyMember } from '@/types/family';

const kids: ChoreGroup = { id: 'kids', memberIds: ['ann', 'ben', 'cal'] };
const teens: ChoreGroup = { id: 'teens', memberIds: ['cal', 'dee'] };

function groupChore(overrides: Partial<ChoreDefinition> = {}): ChoreDefinition {
  return {
    id: 'dishes', name: 'Dishes', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [],
    timeOfDay: 'anytime', assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'fixed',
    ...overrides,
  };
}

describe('choreAssigneeIds', () => {
  it('expands a group to its members', () => {
    expect(choreAssigneeIds(groupChore(), [kids])).toEqual(['ann', 'ben', 'cal']);
  });

  it('lists someone once when they are named directly and through a group', () => {
    expect(choreAssigneeIds(groupChore({ assigneeIds: ['ben'] }), [kids])).toEqual(['ben', 'ann', 'cal']);
  });

  it('lists someone once when two groups hold them', () => {
    expect(choreAssigneeIds(groupChore({ assigneeGroupIds: ['kids', 'teens'] }), [kids, teens])).toEqual(['ann', 'ben', 'cal', 'dee']);
  });

  it('gives a group that no longer exists nobody', () => {
    expect(choreAssigneeIds(groupChore({ assigneeIds: ['dee'], assigneeGroupIds: ['gone'] }), [kids])).toEqual(['dee']);
    expect(choreAssigneeIds(groupChore({ assigneeGroupIds: ['gone'] }), [kids])).toEqual([]);
  });

  it('keeps the saved order of people named directly, so existing rotations do not shift', () => {
    const chore = groupChore({ assigneeIds: ['cal', 'ann'], assigneeGroupIds: undefined });
    expect(choreAssigneeIds(chore, [kids])).toEqual(['cal', 'ann']);
  });
});

describe('resolveAssignee with a group', () => {
  it('gives a fixed chore to everyone in the group', () => {
    expect(resolveAssignee(groupChore(), '2024-01-01', [kids])).toEqual(['ann', 'ben', 'cal']);
  });

  it('takes daily turns through the group in its order', () => {
    const chore = groupChore({ rotation: 'rotate-daily' });
    expect(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'].map((date) => resolveAssignee(chore, date, [kids])))
      .toEqual([['ann'], ['ben'], ['cal'], ['ann']]);
  });

  it('takes weekly turns through the group in its order', () => {
    const chore = groupChore({ rotation: 'rotate-weekly' });
    expect(['2024-01-01', '2024-01-08', '2024-01-15'].map((date) => resolveAssignee(chore, date, [kids])))
      .toEqual([['ann'], ['ben'], ['cal']]);
  });

  it('rotates a group-only chore rather than treating its empty direct list as nobody', () => {
    expect(resolveAssignee(groupChore({ rotation: 'rotate-daily' }), '2024-01-02', [kids])).not.toEqual([]);
  });

  it('follows the group when someone joins it', () => {
    const grown: ChoreGroup = { ...kids, memberIds: [...kids.memberIds, 'eve'] };
    expect(choresAssignedTo([groupChore()], 'eve', '2024-01-01', [kids])).toEqual([]);
    expect(choresAssignedTo([groupChore()], 'eve', '2024-01-01', [grown])).toHaveLength(1);
  });

  it('gives each member of the group their own row and their own tick', () => {
    const member = (id: string): FamilyMember => ({ id, name: id, color: '#000000', createdAt: '', updatedAt: '' });
    const rows = resolveAssignmentsFor([groupChore()], ['ann', 'ben', 'cal'].map(member), '2024-01-01', new Set(['dishes-ben-2024-01-01']), [kids]);
    expect(rows.map((row) => [row.memberId, row.isCompleted])).toEqual([['ann', false], ['ben', true], ['cal', false]]);
  });
});

// 2024-01-01, the epoch the week count starts from, is a Monday.
describe('week boundaries', () => {
  const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
  const pair: ChoreDefinition = {
    id: 'bins', name: 'Bins', emoji: '', points: 1, frequency: 'weekly', daysOfWeek: [],
    timeOfDay: 'anytime', assigneeIds: ['ann', 'ben'], rotation: 'rotate-weekly',
  };

  it('keeps a weekly turn with one person from Monday through Sunday', () => {
    const turns = week.map((date) => resolveAssignee(pair, date, [])[0]);
    expect(new Set(turns).size).toBe(1);
  });

  it('hands over on Monday', () => {
    expect(resolveAssignee(pair, '2026-09-20', [])).not.toEqual(resolveAssignee(pair, '2026-09-21', []));
  });

  it('keeps an every-other-week chore on or off for the whole week', () => {
    const on = week.map((date) => choreAppliesToday({ ...pair, frequency: 'biweekly' }, new Date(`${date}T00:00:00`).getDay(), date));
    expect(new Set(on).size).toBe(1);
    const next = choreAppliesToday({ ...pair, frequency: 'biweekly' }, 1, '2026-09-21');
    expect(next).toBe(!on[0]);
  });
});
