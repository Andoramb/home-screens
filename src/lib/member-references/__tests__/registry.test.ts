import { describe, it, expect } from 'vitest';
import { MEMBER_REFERENCE_DOMAINS, type Doc, type RestorePlan } from '@/lib/member-references';
import { FamilyError } from '@/lib/family-errors';

const now = '2026-01-01T00:00:00.000Z';

/**
 * One row per registered file: a document naming a person who is leaving
 * (`gone`) and one who stays (`kept`), what removal must leave behind, and
 * what a restore into a family holding only `kept` must decide. The rows are
 * matched against the registry both ways, so a new member-based domain fails
 * here until it declares its policies and a row exercises them.
 */
const CASES: Record<string, { doc: Doc; afterRemoval: Doc; restore: { missing: number; doc?: Doc; evidence?: RestorePlan['evidence'] } }> = {
  'data/config.json': {
    doc: { settings: { calendar: { personSources: { gone: ['c1'], kept: ['c2'] } } } },
    afterRemoval: { settings: { calendar: { personSources: { kept: ['c2'] } } } },
    // Calendar ownership is settled by the family merge on the way in.
    restore: { missing: 0 },
  },
  'data/chores.json': {
    doc: { chores: [
      { id: 'solo', assigneeIds: ['gone'] },
      { id: 'pair', assigneeIds: ['gone', 'kept'], rotation: 'schedule', daysOfWeek: [1, 2], schedule: { gone: [1], kept: [2] } },
    ] },
    afterRemoval: { chores: [{ id: 'pair', assigneeIds: ['kept'], rotation: 'fixed', daysOfWeek: [2] }] },
    // Two assignee lists and one schedule name the missing person.
    restore: { missing: 3 },
  },
  'data/chore-completions.json': {
    doc: { completions: [{ choreId: 'x', memberId: 'gone' }, { choreId: 'x', memberId: 'kept' }] },
    afterRemoval: { completions: [{ choreId: 'x', memberId: 'kept' }] },
    restore: { missing: 0, evidence: { historicalOrphans: { policy: 'preserve-ledger-entries-without-creating-members', completions: [{ choreId: 'x', memberId: 'gone' }] } } },
  },
  'data/rewards.json': {
    doc: {
      rewards: [{ id: 'r', memberIds: ['gone', 'kept'], enabled: true }, { id: 'o', memberIds: ['gone'], enabled: true }],
      balances: { gone: 3, kept: 4 },
      redemptions: [{ memberId: 'gone' }],
    },
    afterRemoval: {
      rewards: [{ id: 'r', memberIds: ['kept'], enabled: true }, { id: 'o', memberIds: [], enabled: true }],
      balances: { kept: 4 },
      redemptions: [{ memberId: 'gone' }],
    },
    restore: {
      missing: 0,
      doc: {
        rewards: [{ id: 'r', memberIds: ['kept'], enabled: true }, { id: 'o', memberIds: [], enabled: false }],
        balances: { gone: 3, kept: 4 },
        redemptions: [{ memberId: 'gone' }],
      },
      evidence: {
        historicalOrphans: { policy: 'preserve-ledger-entries-without-creating-members', balances: { gone: 3 } },
        rewardAssignmentRepairs: { policy: 'remove-missing-members-disable-if-none-remain', records: [
          { before: { id: 'r', memberIds: ['gone', 'kept'], enabled: true }, removedMemberIds: ['gone'], disabled: false },
          { before: { id: 'o', memberIds: ['gone'], enabled: true }, removedMemberIds: ['gone'], disabled: true },
        ] },
      },
    },
  },
  'data/todos.json': {
    doc: { migratedFromConfig: true, lists: [{
      id: 'list', name: 'List', slug: 'list', repeat: 'never', createdAt: now, updatedAt: now,
      items: [{ id: 'item', text: 'Task', completed: false, createdAt: now, assigneeIds: ['gone', 'kept'] }],
    }] },
    afterRemoval: { migratedFromConfig: true, lists: [{
      id: 'list', name: 'List', slug: 'list', repeat: 'never', createdAt: now, updatedAt: now,
      items: [{ id: 'item', text: 'Task', completed: false, createdAt: now, assigneeIds: ['kept'] }],
    }] },
    restore: { missing: 1 },
  },
  'data/timetables.json': {
    doc: { schools: [], subjects: [], timetables: [{ memberId: 'gone' }, { memberId: 'kept' }] },
    afterRemoval: { schools: [], subjects: [], timetables: [{ memberId: 'kept' }] },
    restore: {
      missing: 0,
      doc: { schools: [], subjects: [], timetables: [{ memberId: 'kept' }] },
      evidence: { timetableRepairs: { policy: 'drop-timetables-whose-person-is-missing', records: [{ before: { memberId: 'gone' }, removedMemberId: 'gone' }] } },
    },
  },
};

describe('member reference registry', () => {
  it('lists every file this suite knows about, and nothing else', () => {
    expect(MEMBER_REFERENCE_DOMAINS.map((domain) => domain.path)).toEqual(Object.keys(CASES));
  });

  it('names each file once, under the data root', () => {
    const paths = MEMBER_REFERENCE_DOMAINS.map((domain) => domain.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path).toMatch(/^data\/[a-z-]+\.json$/);
  });

  describe.each(MEMBER_REFERENCE_DOMAINS.map((domain) => [domain.path, domain] as const))('%s', (path, domain) => {
    const { doc, afterRemoval, restore } = CASES[path];
    const gone = new Set(['gone']);
    const family = new Set(['kept']);

    it('removes a person the way its policy says, without touching the input', () => {
      const before = JSON.stringify(doc);
      expect(domain.removeMembers(doc, gone)).toEqual(afterRemoval);
      expect(JSON.stringify(doc)).toBe(before);
    });

    it('changes nothing when nobody is removed', () => {
      expect(domain.removeMembers(doc, new Set())).toEqual(doc);
    });

    it('plans a restore the way its policy says, without touching the input', () => {
      const before = JSON.stringify(doc);
      const plan = domain.planRestore(doc, family);
      expect(plan.missing).toHaveLength(restore.missing);
      for (const entry of plan.missing) expect(entry).toContain('"gone"');
      expect(plan.doc).toEqual(restore.doc);
      expect(plan.evidence).toEqual(restore.evidence ?? {});
      expect(JSON.stringify(doc)).toBe(before);
    });

    it('has nothing to repair or refuse when everyone is present', () => {
      expect(domain.planRestore(doc, new Set(['gone', 'kept']))).toEqual({ missing: [], evidence: {} });
    });

    it(`treats a document in another shape as "${domain.unreadable}" says`, () => {
      const stranger: Doc = { unrelated: true };
      if (domain.unreadable === 'skip') {
        expect(domain.removeMembers(stranger, gone)).toBe(stranger);
        expect(domain.planRestore(stranger, family)).toEqual({ missing: [], evidence: {} });
      } else {
        expect(() => domain.removeMembers(stranger, gone)).toThrow(FamilyError);
        let status: unknown;
        try { domain.removeMembers(stranger, gone); } catch (error) { status = (error as FamilyError).status; }
        expect(status).toBe(409);
      }
    });
  });
});
