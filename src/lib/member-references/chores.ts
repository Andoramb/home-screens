import { FamilyError } from '@/lib/family-errors';
import { isRecord, missingAssignment, recordLabel, rows, stripIds, withoutKeys, type Doc, type MemberReferenceDomain, type RestorePlan } from './contract';

const validDays = (days: unknown) => Array.isArray(days) && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);

/**
 * Chore definitions: `assigneeIds` says who a chore can go to, and a
 * per-person `schedule` says which days each of them has it.
 *
 * Removal takes the person out of both and drops a chore nobody is left on.
 * A schedule left with one person collapses back to a fixed rotation on that
 * person's days, since a rotation needs two people to rotate between.
 *
 * Restore refuses a chore that names a missing person rather than guessing
 * who should do it: the restore is stopped with every such record listed.
 */
export const choreReferences: MemberReferenceDomain = {
  path: 'data/chores.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = structuredClone(doc);
    if (!Array.isArray(next.chores)) throw new FamilyError('The saved chore definitions are invalid.', 409);
    next.chores = next.chores.map((chore: unknown) => {
      if (!isRecord(chore)) throw new FamilyError('The saved chore definitions are invalid.', 409);
      const updated: Doc & { assigneeIds: string[] } = { ...chore, assigneeIds: stripIds(chore.assigneeIds, removed) };
      if (chore.schedule !== undefined) {
        const schedule = withoutKeys(chore.schedule, removed);
        if (Object.values(schedule).some((days) => !validDays(days))) throw new FamilyError('The saved chore schedule is invalid.', 409);
        const entries = Object.values(schedule) as number[][];
        if (entries.length === 0 || (entries.length === 1 && updated.rotation === 'schedule')) {
          delete updated.schedule;
          updated.rotation = 'fixed';
          if (entries.length === 1) updated.daysOfWeek = entries[0];
        } else {
          updated.schedule = schedule;
          updated.daysOfWeek = [...new Set(entries.flat())].sort((a, b) => a - b);
        }
      }
      return updated;
    }).filter((chore) => chore.assigneeIds.length > 0);
    return next;
  },
  planRestore(doc, members): RestorePlan {
    const missing: string[] = [];
    for (const [index, chore] of rows(doc.chores, 'Chores').entries()) {
      const label = recordLabel('data/chores.json', `chores[${index}]`, chore);
      missing.push(...missingAssignment(chore.assigneeIds, `${label}, assigneeIds`, members));
      if (chore.schedule !== undefined) {
        if (!isRecord(chore.schedule)) throw new FamilyError(`${label}, schedule must map person IDs to days.`);
        missing.push(...missingAssignment(Object.keys(chore.schedule), `${label}, schedule`, members));
        for (const [id, days] of Object.entries(chore.schedule)) {
          if (!validDays(days)) throw new FamilyError(`${label}, schedule for ${JSON.stringify(id)} contains invalid days.`);
        }
      }
    }
    return { missing, evidence: {} };
  },
};
