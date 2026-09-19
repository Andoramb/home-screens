// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FamilyGroup, FamilyMember } from '@/types/family';
import type { ChoreDefinition } from '@/types/config';
import { useChoreForm } from '../form-hooks';

const stamp = '2026-01-01T00:00:00.000Z';
const members: FamilyMember[] = ['ann', 'ben', 'cal'].map((id) => ({ id, name: id, emoji: '', color: '#000000', createdAt: stamp, updatedAt: stamp }));
const kids: FamilyGroup = { id: 'kids', name: 'Kids', memberIds: ['ann', 'ben', 'cal'], createdAt: stamp, updatedAt: stamp };
const solo: FamilyGroup = { id: 'solo', name: 'Just Ann', memberIds: ['ann'], createdAt: stamp, updatedAt: stamp };

function saved(overrides: Partial<ChoreDefinition>): ChoreDefinition {
  return {
    id: 'c1', name: 'Dishes', emoji: '', points: 1, frequency: 'daily', daysOfWeek: [1, 2],
    timeOfDay: 'anytime', assigneeIds: [], rotation: 'fixed', ...overrides,
  };
}

/** What the form would save right now. */
function submitted(form: ReturnType<typeof useChoreForm>): Omit<ChoreDefinition, 'id'> {
  const onSubmit = vi.fn();
  form.submit(onSubmit);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  return onSubmit.mock.calls[0][0];
}

describe('useChoreForm with family groups', () => {
  it('offers rotation for a group, and no schedule while one is picked', () => {
    const { result } = renderHook(() => useChoreForm(saved({}), members, [kids], true));
    expect(result.current.canRotate).toBe(false);
    act(() => result.current.toggleGroup('kids'));
    expect(result.current.assigneeGroupIds).toEqual(['kids']);
    expect(result.current.canRotate).toBe(true);
    expect(result.current.scheduleAllowed).toBe(false);
  });

  it('refuses to switch to a schedule while a group is picked', () => {
    const { result } = renderHook(() => useChoreForm(saved({ assigneeGroupIds: ['kids'] }), members, [kids], true));
    act(() => result.current.switchToSchedule());
    expect(result.current.rotation).toBe('fixed');
    expect(result.current.schedule).toEqual({});
  });

  it('leaves schedule mode when a group is picked, keeping the scheduled people and days', () => {
    const chore = saved({ rotation: 'schedule', assigneeIds: ['ann', 'ben'], schedule: { ann: [1], ben: [3] } });
    const { result } = renderHook(() => useChoreForm(chore, members, [kids], true));
    act(() => result.current.toggleGroup('kids'));
    expect(result.current.rotation).toBe('fixed');
    expect(result.current.assigneeIds).toEqual(['ann', 'ben']);
    expect(result.current.daysOfWeek).toEqual([1, 3]);
    expect(submitted(result.current)).toMatchObject({ assigneeIds: ['ann', 'ben'], assigneeGroupIds: ['kids'], rotation: 'fixed' });
    expect(submitted(result.current)).not.toHaveProperty('schedule');
  });

  it('saves the group and not the people in it', () => {
    const { result } = renderHook(() => useChoreForm(saved({}), members, [kids], true));
    act(() => result.current.toggleGroup('kids'));
    act(() => result.current.setRotation('rotate-weekly'));
    expect(submitted(result.current)).toMatchObject({ assigneeIds: [], assigneeGroupIds: ['kids'], rotation: 'rotate-weekly' });
  });

  it('keeps a chosen rotation for a group of one', () => {
    const { result } = renderHook(() => useChoreForm(saved({ assigneeGroupIds: ['solo'], rotation: 'rotate-daily' }), members, [solo], true));
    expect(result.current.canRotate).toBe(true);
    expect(submitted(result.current).rotation).toBe('rotate-daily');
  });

  it('drops a group that no longer exists, and then asks for a person or group', () => {
    const { result } = renderHook(() => useChoreForm(saved({ assigneeGroupIds: ['gone'] }), members, [kids], true));
    expect(result.current.assigneeGroupIds).toEqual([]);
    expect(result.current.canSave).toBe(false);
    expect(result.current.validationHintKind).toBe('selectAtLeastOnePersonOrGroup');
  });

  it('unticking the group takes it back off the chore', () => {
    const { result } = renderHook(() => useChoreForm(saved({ assigneeIds: ['ann'], assigneeGroupIds: ['kids'] }), members, [kids], true));
    act(() => result.current.toggleGroup('kids'));
    expect(submitted(result.current)).not.toHaveProperty('assigneeGroupIds');
  });

  // The family list is empty while it loads and after a failed first fetch;
  // an empty list must never read as "this group was removed".
  it('keeps a picked group and holds the save until the family list has loaded', () => {
    const chore = saved({ assigneeIds: ['ann'], assigneeGroupIds: ['kids'] });
    const { result, rerender } = renderHook(({ ready }) => useChoreForm(chore, ready ? members : [], ready ? [kids] : [], ready), { initialProps: { ready: false } });
    act(() => result.current.setName('Dishes, renamed'));
    expect(result.current.assigneeGroupIds).toEqual(['kids']);
    expect(result.current.canSave).toBe(false);
    expect(result.current.validationHintKind).toBe('familyNotReady');
    const onSubmit = vi.fn();
    result.current.submit(onSubmit);
    expect(onSubmit).not.toHaveBeenCalled();

    rerender({ ready: true });
    expect(result.current.canSave).toBe(true);
    expect(submitted(result.current)).toMatchObject({ name: 'Dishes, renamed', assigneeIds: ['ann'], assigneeGroupIds: ['kids'] });
  });
});
