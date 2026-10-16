'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ChoreDefinition } from '@/types/config';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import { useLocale } from '@/i18n';
import {
  DEFAULT_STARTER_WEEKLY_DAY,
  STARTER_CHORE_SECTIONS,
  buildStarterChores,
  defaultStarterAssignment,
  getStarterChoresForLocale,
  reconcileStarterAssignment,
  starterAssignmentHasSomeone,
  starterChoresInSection,
  starterIdsAlreadyAdded,
  type StarterAssignment,
  type StarterChore,
  type StarterChoreId,
  type StarterChoreSection,
} from '@/lib/starter-chores';

export interface StarterSectionView {
  section: StarterChoreSection;
  starters: StarterChore[];
  /** How many rows in this section are ticked. */
  picked: number;
  /** How many rows in this section can still be ticked (not already added). */
  available: number;
  /** True when every pickable row is ticked, so the toggle reads "None". */
  allPicked: boolean;
}

/**
 * The state behind the starter chore picker, shared by the phone and the
 * editor: which starters are ticked, who the batch goes to, which day the
 * weekly ones land on, and what it saves as. The two surfaces draw their own
 * rows over this.
 *
 * The chore list and the family can change underneath an open picker (the
 * phone polls, the editor's family column sits beside it), so what the
 * picker counts and builds is always read against the current props: a
 * starter that somebody else added meanwhile drops out of the batch even
 * though it stays in the ticked set, and a deleted group drops out of the
 * assignment.
 */
export function useStarterChoresPicker(
  chores: readonly ChoreDefinition[],
  members: readonly FamilyMember[],
  groups: readonly FamilyGroup[],
) {
  const locale = useLocale();
  const starters = useMemo(() => getStarterChoresForLocale(locale), [locale]);
  const alreadyAdded = useMemo(() => starterIdsAlreadyAdded(starters, chores), [starters, chores]);
  const [tickedIds, setTickedIds] = useState<ReadonlySet<StarterChoreId>>(() => new Set());
  const [rawAssignment, setRawAssignment] = useState<StarterAssignment>(() => defaultStarterAssignment(members, groups));
  const [weeklyDay, setWeeklyDay] = useState(DEFAULT_STARTER_WEEKLY_DAY);

  /** The ticked starters that can still be added. */
  const pickedIds = useMemo<ReadonlySet<StarterChoreId>>(
    () => new Set([...tickedIds].filter((id) => !alreadyAdded.has(id))),
    [tickedIds, alreadyAdded],
  );
  const assignment = useMemo(() => reconcileStarterAssignment(rawAssignment, members, groups), [rawAssignment, members, groups]);

  const toggle = useCallback((id: StarterChoreId) => {
    if (alreadyAdded.has(id)) return;
    setTickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [alreadyAdded]);

  const sections = useMemo<StarterSectionView[]>(() => STARTER_CHORE_SECTIONS.map((section) => {
    const rows = starterChoresInSection(starters, section);
    const pickable = rows.filter((row) => !alreadyAdded.has(row.id));
    const picked = pickable.filter((row) => pickedIds.has(row.id)).length;
    return {
      section,
      starters: rows,
      picked,
      available: pickable.length,
      allPicked: pickable.length > 0 && picked === pickable.length,
    };
  }), [starters, alreadyAdded, pickedIds]);

  /** Tick every pickable row of a section, or clear the section when all are ticked. */
  const toggleSection = useCallback((section: StarterChoreSection) => {
    const view = sections.find((s) => s.section === section);
    if (!view) return;
    setTickedIds((prev) => {
      const next = new Set(prev);
      for (const row of view.starters) {
        if (alreadyAdded.has(row.id)) continue;
        if (view.allPicked) next.delete(row.id);
        else next.add(row.id);
      }
      return next;
    });
  }, [sections, alreadyAdded]);

  const toggleMember = useCallback((memberId: string) => {
    setRawAssignment((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(memberId)
        ? prev.assigneeIds.filter((id) => id !== memberId)
        : [...prev.assigneeIds, memberId],
    }));
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setRawAssignment((prev) => ({
      ...prev,
      assigneeGroupIds: prev.assigneeGroupIds.includes(groupId)
        ? prev.assigneeGroupIds.filter((id) => id !== groupId)
        : [...prev.assigneeGroupIds, groupId],
    }));
  }, []);

  const pickedCount = pickedIds.size;
  const hasSomeone = starterAssignmentHasSomeone(assignment);
  const canAdd = pickedCount > 0 && hasSomeone;

  const build = useCallback(
    () => buildStarterChores(starters, pickedIds, assignment, weeklyDay),
    [starters, pickedIds, assignment, weeklyDay],
  );

  return {
    starters,
    sections,
    alreadyAdded,
    pickedIds,
    pickedCount,
    assignment,
    hasSomeone,
    canAdd,
    weeklyDay,
    setWeeklyDay,
    toggle,
    toggleSection,
    toggleMember,
    toggleGroup,
    build,
  };
}
