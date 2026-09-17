import type { FamilyGroup, FamilyMember } from '@/types/family';
import { FAMILY_LIMITS } from '@/types/family';

/**
 * Rules for family groups, shared by the roster editors (editor and phone),
 * the family data layer and the calendar modules. A group is a named set of
 * members that lives on the family list; nothing else owns one.
 */

/** The members of a group in family order, skipping ids no longer on the list. */
export function groupMembers(group: Pick<FamilyGroup, 'memberIds'>, members: readonly FamilyMember[]): FamilyMember[] {
  const wanted = new Set(group.memberIds);
  return members.filter((member) => wanted.has(member.id));
}

/** Groups with the removed people taken out. Empty groups stay: the owner may refill them. */
export function pruneGroupMembers(groups: readonly FamilyGroup[] | undefined, removed: ReadonlySet<string>): FamilyGroup[] {
  return (groups ?? []).map((group) => {
    const memberIds = group.memberIds.filter((id) => !removed.has(id));
    return memberIds.length === group.memberIds.length ? group : { ...group, memberIds };
  });
}

/** Why a group draft cannot be saved, or null when it can. */
export function groupDraftProblem(draft: { name: string; memberIds: readonly string[] }, members: readonly FamilyMember[]): 'name' | 'nameLength' | 'members' | null {
  if (!draft.name.trim()) return 'name';
  if (draft.name.trim().length > FAMILY_LIMITS.maxGroupNameLength) return 'nameLength';
  const known = new Set(members.map((member) => member.id));
  if (draft.memberIds.some((id) => !known.has(id))) return 'members';
  return null;
}

/**
 * The calendar's "show only these people" choice. Empty member and group
 * lists mean no people filter at all, so a screen that never picked anyone
 * keeps showing every calendar.
 */
export interface PeopleFilter {
  memberIds: string[];
  groupIds: string[];
  /** Keep events from calendars nobody owns (household calendars, holidays). */
  includeShared: boolean;
}

export function hasPeopleFilter(filter: PeopleFilter | undefined): filter is PeopleFilter {
  return !!filter && (filter.memberIds.length > 0 || filter.groupIds.length > 0);
}

/**
 * The member ids a people filter names once its groups are expanded. A group
 * that no longer exists contributes nobody, so a screen pointed at a deleted
 * group shows only the people it also named directly.
 */
export function resolvePeopleFilterMembers(filter: PeopleFilter, groups: readonly Pick<FamilyGroup, 'id' | 'memberIds'>[]): Set<string> {
  const ids = new Set(filter.memberIds);
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const groupId of filter.groupIds) {
    for (const memberId of byId.get(groupId)?.memberIds ?? []) ids.add(memberId);
  }
  return ids;
}

/** The calendar source ids the given people own. */
export function sourceIdsForMembers(memberIds: ReadonlySet<string>, personSources: Record<string, string[]> | undefined): Set<string> {
  const ids = new Set<string>();
  if (!personSources) return ids;
  for (const memberId of memberIds) for (const sourceId of personSources[memberId] ?? []) ids.add(sourceId);
  return ids;
}
