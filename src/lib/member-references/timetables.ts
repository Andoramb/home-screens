import { isRecord, rows, type Doc, type MemberReferenceDomain, type RestorePlan } from './contract';

export const TIMETABLE_REPAIR_POLICY = 'drop-timetables-whose-person-is-missing';

/**
 * School timetables: one per person, holding nothing else about them.
 *
 * A timetable whose person is gone has nothing left to keep, so removal and
 * restore both drop it; restore records what it dropped. The file is read by
 * one page only, so a file in some other shape must never stop a family
 * change: it is skipped when unreadable and left alone when `timetables` is
 * not a list.
 */
export const timetableReferences: MemberReferenceDomain = {
  path: 'data/timetables.json',
  unreadable: 'skip',
  removeMembers(doc, removed) {
    if (!Array.isArray(doc.timetables)) return doc;
    const next = structuredClone(doc);
    next.timetables = (next.timetables as unknown[]).filter((timetable) => !isRecord(timetable) || !removed.has(timetable.memberId as string));
    return next;
  },
  planRestore(doc, members): RestorePlan {
    if (!Array.isArray(doc.timetables)) return { missing: [], evidence: {} };
    const repairs: { before: Doc; removedMemberId: unknown }[] = [];
    const kept = rows(doc.timetables, 'Timetables').filter((timetable) => {
      if (members.has(timetable.memberId as string)) return true;
      repairs.push({ before: timetable, removedMemberId: timetable.memberId });
      return false;
    });
    if (repairs.length === 0) return { missing: [], evidence: {} };
    return { doc: { ...doc, timetables: kept }, missing: [], evidence: { timetableRepairs: { policy: TIMETABLE_REPAIR_POLICY, records: repairs } } };
  },
};
