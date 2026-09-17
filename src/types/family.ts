/** Shared identity used by chores, calendars, rewards and lists. */
export interface FamilyMember {
  /** Unique ID */
  id: string;
  /** Name */
  name: string;
  /** Color used for this person everywhere */
  color: string;
  /** Emoji shown with the name */
  emoji?: string;
  /** When the person was added (ISO timestamp) */
  createdAt: string;
  /** When the person was last changed (ISO timestamp) */
  updatedAt: string;
}

/**
 * A named set of family members ("Kids", "Parents"). Groups have no color of
 * their own; on screen they read as a stack of their members' avatars. A person
 * can be in more than one group.
 */
export interface FamilyGroup {
  /** Unique ID */
  id: string;
  /** Name shown wherever the group is listed */
  name: string;
  /** Member IDs in the group, in family order */
  memberIds: string[];
  /** When the group was added (ISO timestamp) */
  createdAt: string;
  /** When the group was last changed (ISO timestamp) */
  updatedAt: string;
}

export interface FamilyData {
  /** The household, in display order (see the member table below) */
  members: FamilyMember[];
  /** Named sets of members, used by the calendar's color key and people filter */
  groups?: FamilyGroup[];
  /** Set once older chore and calendar people have been folded into this list */
  migrated?: boolean;
  /**
   * Older calendar person IDs, mapped to the member each one became
   *
   * Legacy calendar identity -> current member. Never a chain or self-alias.
   */
  aliasIds?: Record<string, string>;
}

export interface FamilyResponse {
  members: FamilyMember[];
  groups: FamilyGroup[];
  revision: string;
}

export const FAMILY_LIMITS = { maxMembers: 64, maxNameLength: 40, maxGroups: 16, maxGroupNameLength: 40 } as const;

export const MEMBER_COLORS = [
  '#f472b6', '#60a5fa', '#4ade80', '#fbbf24', '#a78bfa',
  '#fb923c', '#22d3ee', '#f87171', '#34d399', '#e879f9',
] as const;
