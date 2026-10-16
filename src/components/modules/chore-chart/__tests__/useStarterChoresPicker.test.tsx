// @vitest-environment jsdom

/**
 * The picker's state must follow the props underneath it: the phone polls the
 * chore list and the editor's family column sits beside the panel, so what is
 * counted and built is read against the current list and family, not the
 * ones the picker opened with.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { ChoreDefinition } from '@/types/config';
import { useStarterChoresPicker } from '../useStarterChoresPicker';

vi.mock('@/i18n', () => ({ useLocale: () => 'en-US' }));

const stamp = '2026-01-01T00:00:00.000Z';
const members: FamilyMember[] = ['ann', 'ben'].map((id) => ({ id, name: id, emoji: '', color: '#000000', createdAt: stamp, updatedAt: stamp }));
const kids: FamilyGroup = { id: 'kids', name: 'Kids', memberIds: ['ann', 'ben'], createdAt: stamp, updatedAt: stamp };

function chore(name: string): ChoreDefinition {
  return { id: name, name, emoji: '', points: 1, frequency: 'daily', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['ann'], rotation: 'fixed' };
}

describe('useStarterChoresPicker', () => {
  it('drops a ticked starter from the batch once somebody else adds it', () => {
    let chores: ChoreDefinition[] = [];
    const { result, rerender } = renderHook(() => useStarterChoresPicker(chores, members, [kids]));
    act(() => { result.current.toggle('make-bed'); result.current.toggle('walk-dog'); });
    expect(result.current.pickedCount).toBe(2);

    // Another phone saved "Make your bed" while this picker was open.
    chores = [chore('Make your bed')];
    rerender();
    expect(result.current.alreadyAdded.has('make-bed')).toBe(true);
    expect(result.current.pickedCount).toBe(1);
    expect(result.current.build().map((c) => c.name)).toEqual(['Walk the dog']);
  });

  it('drops a deleted group from the assignment and refuses the batch when nobody is left', () => {
    let groups: FamilyGroup[] = [kids];
    const { result, rerender } = renderHook(() => useStarterChoresPicker([], members, groups));
    expect(result.current.assignment).toEqual({ assigneeIds: [], assigneeGroupIds: ['kids'] });
    act(() => { result.current.toggle('make-bed'); });
    expect(result.current.canAdd).toBe(true);

    groups = [];
    rerender();
    expect(result.current.assignment).toEqual({ assigneeIds: [], assigneeGroupIds: [] });
    expect(result.current.canAdd).toBe(false);

    act(() => { result.current.toggleMember('ann'); });
    expect(result.current.canAdd).toBe(true);
    expect(result.current.build()[0]).toMatchObject({ assigneeIds: ['ann'] });
    expect(result.current.build()[0]).not.toHaveProperty('assigneeGroupIds');
  });

  it('saves the weekly section on the day picked for it', () => {
    const { result } = renderHook(() => useStarterChoresPicker([], members, []));
    act(() => { result.current.toggle('take-out-trash'); });
    expect(result.current.weeklyDay).toBe(6);
    expect(result.current.build()[0].daysOfWeek).toEqual([6]);
    act(() => { result.current.setWeeklyDay(3); });
    expect(result.current.build()[0].daysOfWeek).toEqual([3]);
  });
});
