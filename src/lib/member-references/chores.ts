import { FamilyError } from '@/lib/family-errors';
import { isRecord, missingAssignment, recordLabel, rows, stripIds, withoutKeys, type Doc, type MemberReferenceDomain, type RestorePlan } from './contract';

const validDays = (days: unknown) => Array.isArray(days) && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);

/** A chore's saved group list; absent means none, anything else malformed stops the removal. */
function groupIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) throw new FamilyError('A saved chore group assignment is invalid.', 409);
  return value;
}

/**
 * The chore file after these family groups are removed: their ids come off
 * every chore that named them. A chore left with nobody stays in the list so
 * its name, tickets and days are not lost; it goes to no one until somebody
 * is picked for it. The same document back means nothing named the groups.
 */
export function removeChoreGroups(doc: Doc, removed: ReadonlySet<string>): Doc {
  if (!Array.isArray(doc.chores)) throw new FamilyError('The saved chore definitions are invalid.', 409);
  let changed = false;
  const chores = doc.chores.map((chore: unknown) => {
    if (!isRecord(chore)) throw new FamilyError('The saved chore definitions are invalid.', 409);
    const before = groupIds(chore.assigneeGroupIds);
    const kept = before.filter((id) => !removed.has(id));
    if (kept.length === before.length) return chore;
    changed = true;
    const { assigneeGroupIds: _dropped, ...rest } = chore;
    return kept.length > 0 ? { ...rest, assigneeGroupIds: kept } : rest;
  });
  return changed ? { ...doc, chores } : doc;
}

/**
 * Chore definitions: `assigneeIds` says who a chore can go to,
 * `assigneeGroupIds` names family groups whose members get it too, and a
 * per-person `schedule` says which days each of them has it.
 *
 * Removal takes the person out of both and drops a chore that removal left
 * with nobody. A chore that goes to a group is never dropped: its
 * `assigneeIds` is empty by design, and the group itself is pruned on the
 * family list. Neither is a chore that already had nobody, which is what a
 * removed group leaves behind until someone is picked for it.
 * A schedule left with one person collapses back to a fixed rotation on that
 * person's days, since a rotation needs two people to rotate between.
 *
 * Restore refuses a chore that names a missing person or group rather than
 * guessing who should do it: the restore is stopped with every such record
 * listed.
 */
export const choreReferences: MemberReferenceDomain = {
  path: 'data/chores.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = structuredClone(doc);
    if (!Array.isArray(next.chores)) throw new FamilyError('The saved chore definitions are invalid.', 409);
    next.chores = next.chores.flatMap((chore: unknown) => {
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
      const goesToGroup = groupIds(chore.assigneeGroupIds).length > 0;
      const emptied = updated.assigneeIds.length === 0 && (chore.assigneeIds as string[]).length > 0;
      return emptied && !goesToGroup ? [] : [updated];
    });
    return next;
  },
  planRestore(doc, members, groups): RestorePlan {
    const missing: string[] = [];
    for (const [index, chore] of rows(doc.chores, 'Chores').entries()) {
      const label = recordLabel('data/chores.json', `chores[${index}]`, chore);
      missing.push(...missingAssignment(chore.assigneeIds, `${label}, assigneeIds`, members));
      if (chore.assigneeGroupIds !== undefined) missing.push(...missingAssignment(chore.assigneeGroupIds, `${label}, assigneeGroupIds`, groups));
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
