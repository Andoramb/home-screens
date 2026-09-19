import { describe, it, expect } from 'vitest';
import type { ChoreDefinition } from '@/types/config';
import type { TranslateFn } from '@/i18n';
import {
  buildChoreAssigneeLine,
  buildChoreSummaryLine,
  finalizeChoreAssignment,
  getChoreRotationSummaryKey,
  getChoreValidationHintKind,
} from '../chore-form-presentation';

// Translate stub that echoes the key plus any vars in a predictable shape so
// assertions can verify both the chosen key and the param plumbing without
// pulling in the real provider.
const fakeT: TranslateFn = (key, vars) => {
  if (!vars) return `[${key}]`;
  const parts = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',');
  return `[${key} ${parts}]`;
};

function makeChore(overrides: Partial<ChoreDefinition>): ChoreDefinition {
  return {
    id: 'c1',
    name: 'Test',
    emoji: '✨',
    points: 2,
    frequency: 'daily',
    daysOfWeek: [],
    timeOfDay: 'morning',
    assigneeIds: [],
    rotation: 'fixed',
    ...overrides,
  };
}

describe('buildChoreSummaryLine', () => {
  it('routes daily frequency through the choreSummary.daily key', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'daily', points: 2 }),
      t: fakeT,
    });
    expect(out).toBe(
      '[chore-chart.choreSummary.daily] · [chore-chart.timeOfDay.morning] · [chore-chart.choreSummary.ticketCountPlural count=2]',
    );
  });

  it('routes weekly frequency through the choreSummary.weekly key', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'weekly', points: 3, timeOfDay: 'afternoon' }),
      t: fakeT,
    });
    expect(out).toContain('[chore-chart.choreSummary.weekly]');
    expect(out).toContain('[chore-chart.timeOfDay.afternoon]');
  });

  it('routes biweekly frequency through the choreSummary.biweekly key', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'biweekly', points: 4 }),
      t: fakeT,
    });
    expect(out).toContain('[chore-chart.choreSummary.biweekly]');
  });

  it('uses the dated `once` key when specificDate is set', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'once', specificDate: '2026-06-01', points: 1 }),
      t: fakeT,
    });
    expect(out).toBe(
      '[chore-chart.choreSummary.once date=2026-06-01] · [chore-chart.timeOfDay.morning] · [chore-chart.choreSummary.ticketCountSingular count=1]',
    );
  });

  it('uses the dateless `onceNoDate` key when specificDate is missing', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ frequency: 'once', specificDate: undefined, points: 5 }),
      t: fakeT,
    });
    expect(out).toContain('[chore-chart.choreSummary.onceNoDate]');
  });

  it('singularizes the ticket count when points === 1', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ points: 1 }),
      t: fakeT,
    });
    expect(out).toContain('[chore-chart.choreSummary.ticketCountSingular count=1]');
  });

  it('pluralizes the ticket count when points !== 1', () => {
    const out = buildChoreSummaryLine({
      chore: makeChore({ points: 7 }),
      t: fakeT,
    });
    expect(out).toContain('[chore-chart.choreSummary.ticketCountPlural count=7]');
  });
});

describe('getChoreValidationHintKind', () => {
  it('returns `enterName` when name is blank', () => {
    expect(
      getChoreValidationHintKind({
        name: '',
        rotation: 'fixed',
        scheduleHasAssignment: false,
        assigneeIdsLength: 1,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
      familyReady: true,
      }),
    ).toBe('enterName');
  });

  it('returns `enterName` when name is whitespace only', () => {
    expect(
      getChoreValidationHintKind({
        name: '   ',
        rotation: 'fixed',
        scheduleHasAssignment: true,
        assigneeIdsLength: 2,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
      familyReady: true,
      }),
    ).toBe('enterName');
  });

  it('returns `addPersonToSchedule` when rotation is schedule and no member is scheduled', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'schedule',
        scheduleHasAssignment: false,
        assigneeIdsLength: 0,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
      familyReady: true,
      }),
    ).toBe('addPersonToSchedule');
  });

  it('returns `addPersonToSchedule` even when assigneeIds is non-empty (schedule rotation ignores assigneeIds)', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'schedule',
        scheduleHasAssignment: false,
        assigneeIdsLength: 3,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
      familyReady: true,
      }),
    ).toBe('addPersonToSchedule');
  });

  it('returns `selectAtLeastOnePerson` when rotation is not schedule and no assignees are picked', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'fixed',
        scheduleHasAssignment: false,
        assigneeIdsLength: 0,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
      familyReady: true,
      }),
    ).toBe('selectAtLeastOnePerson');
  });

  it('returns null for a valid fixed-rotation chore', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'fixed',
        scheduleHasAssignment: false,
        assigneeIdsLength: 1,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
      familyReady: true,
      }),
    ).toBeNull();
  });

  it('returns null for a valid scheduled chore', () => {
    expect(
      getChoreValidationHintKind({
        name: 'Sweep',
        rotation: 'schedule',
        scheduleHasAssignment: true,
        assigneeIdsLength: 0,
        assigneeGroupIdsLength: 0,
        hasGroups: false,
      familyReady: true,
      }),
    ).toBeNull();
  });
});

describe('chores handed to a group', () => {
  const stamp = '2026-01-01T00:00:00.000Z';
  const kids = { id: 'kids', name: 'Kids', memberIds: ['ann', 'ben', 'cal'], createdAt: stamp, updatedAt: stamp };
  const solo = { id: 'solo', name: 'Just Ann', memberIds: ['ann'], createdAt: stamp, updatedAt: stamp };
  const members = ['ann', 'ben', 'cal'].map((id) => ({ id, name: id.toUpperCase(), color: '#000000', createdAt: stamp, updatedAt: stamp }));
  const base = { rotation: 'rotate-weekly' as const, schedule: {}, assigneeIds: [], assigneeGroupIds: ['kids'], groups: [kids, solo] };

  it('accepts a group with no people picked, and asks for a person or group when there is neither', () => {
    const args = { name: 'Dishes', rotation: 'fixed' as const, scheduleHasAssignment: true, assigneeIdsLength: 0, familyReady: true };
    expect(getChoreValidationHintKind({ ...args, assigneeIdsLength: 1, assigneeGroupIdsLength: 0, hasGroups: false, familyReady: false })).toBe('familyNotReady');
    expect(getChoreValidationHintKind({ ...args, assigneeGroupIdsLength: 1, hasGroups: true })).toBeNull();
    expect(getChoreValidationHintKind({ ...args, assigneeGroupIdsLength: 0, hasGroups: true })).toBe('selectAtLeastOnePersonOrGroup');
    expect(getChoreValidationHintKind({ ...args, assigneeGroupIdsLength: 0, hasGroups: false })).toBe('selectAtLeastOnePerson');
  });

  it('keeps a chosen rotation for one group of several people', () => {
    expect(finalizeChoreAssignment(base)).toEqual({ assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'rotate-weekly' });
  });

  it('keeps a chosen rotation for a group of one, since the group can grow', () => {
    expect(finalizeChoreAssignment({ ...base, assigneeGroupIds: ['solo'] }).rotation).toBe('rotate-weekly');
  });

  it('still falls back to fixed for one person picked directly', () => {
    expect(finalizeChoreAssignment({ ...base, assigneeIds: ['ann'], assigneeGroupIds: [] }).rotation).toBe('fixed');
  });

  it('saves no groups with a schedule, and no group field when none is picked', () => {
    const scheduled = finalizeChoreAssignment({ ...base, rotation: 'schedule', schedule: { ann: [1], ben: [] } });
    expect(scheduled).toEqual({ assigneeIds: ['ann'], rotation: 'schedule' });
    expect(finalizeChoreAssignment({ ...base, assigneeIds: ['ann', 'ben'], assigneeGroupIds: [] })).toEqual({ assigneeIds: ['ann', 'ben'], rotation: 'rotate-weekly' });
  });

  it('names groups before people in a chore row and leaves out a removed group', () => {
    const chore = { assigneeIds: ['cal'], assigneeGroupIds: ['kids', 'gone'] } as ChoreDefinition;
    expect(buildChoreAssigneeLine({ chore, members, groups: [kids], unknownLabel: '?', nobodyLabel: 'Nobody yet' })).toBe('Kids, CAL');
    const empty = { assigneeIds: [] } as unknown as ChoreDefinition;
    expect(buildChoreAssigneeLine({ chore: empty, members, groups: [kids], unknownLabel: '?', nobodyLabel: 'Nobody yet' })).toBe('Nobody yet');
  });

  it('shows the rotation suffix from the expanded count', () => {
    const chore = { assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'rotate-daily' } as unknown as ChoreDefinition;
    expect(getChoreRotationSummaryKey(chore, [kids])).toBe('chore-chart.choreSummary.rotationDaily');
    expect(getChoreRotationSummaryKey({ ...chore, assigneeGroupIds: ['solo'] }, [solo])).toBeNull();
  });
});
