// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import enUSModules from '@/translations/en-US/modules.json';
import enUSCore from '@/translations/en-US/core.json';
import type { FamilyMember } from '@/types/family';
import type { ChoreChartConfig, ChoreDefinition } from '@/types/config';
import type { MemberStats, ResolvedAssignment } from '../types';
import { UNCHECK_HOLD_MS } from '@/hooks/useHoldToUncheck';
import { TodayView } from '../views/TodayView';

function wrap(children: React.ReactNode) {
  return (
    <I18nProvider locale="en-US" blob={{ modules: enUSModules, core: enUSCore }}>
      {children}
    </I18nProvider>
  );
}

const noah: FamilyMember = {
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  id: 'kid-1', name: 'Noah', emoji: '', color: '#8b5cf6',
};

function chore(points: number): ChoreDefinition {
  return {
    id: 'chore-1', name: 'Load the dishwasher', emoji: '', points, frequency: 'daily',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timeOfDay: 'anytime', assigneeIds: ['kid-1'], rotation: 'fixed',
  };
}

const stats = new Map<string, MemberStats>([
  ['kid-1', { total: 1, completed: 0, percentage: 0, streak: 0, weeklyPoints: 0, weeklyPointsTotal: 0, rewardBalance: 0, weekAssigned: 1 }],
]);

function config(overrides: Partial<ChoreChartConfig> = {}): ChoreChartConfig {
  return {
    view: 'today', weekStartDay: 'monday', showPoints: true, showStreaks: true,
    showTimeOfDay: true, allowDisplayComplete: true, accentColor: '#8b5cf6', ...overrides,
  };
}

function renderToday(opts: { isCompleted?: boolean; points?: number; cfg?: Partial<ChoreChartConfig> } = {}) {
  const toggleComplete = vi.fn(async () => {});
  const assignment: ResolvedAssignment = {
    chore: chore(opts.points ?? 3), memberId: 'kid-1', isCompleted: opts.isCompleted ?? false, groupIds: [],
  };
  render(wrap(
    <TodayView
      config={config(opts.cfg)}
      data={{ members: [noah], todayAssignments: [assignment], memberStats: stats, toggleComplete }}
      fontSize={16}
    />,
  ));
  return { toggleComplete, row: screen.getByRole('button', { name: /Load the dishwasher/ }) };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe('un-ticking a finished chore on the wall', () => {
  it('ignores a plain tap so a passer-by cannot undo finished work', () => {
    const { toggleComplete, row } = renderToday({ isCompleted: true });

    fireEvent.pointerDown(row);
    fireEvent.pointerUp(row);
    fireEvent.click(row, { detail: 1 });

    expect(toggleComplete).not.toHaveBeenCalled();
  });

  it('says what to do instead after that tap', () => {
    const { row } = renderToday({ isCompleted: true });

    fireEvent.pointerDown(row);
    fireEvent.pointerUp(row);

    expect(screen.getByRole('status').textContent).toBe('Press and hold to un-check');
  });

  it('un-ticks on a press and hold', () => {
    const { toggleComplete, row } = renderToday({ isCompleted: true });

    fireEvent.pointerDown(row);
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-1');
    expect(toggleComplete).toHaveBeenCalledTimes(1);

    // The click that trails a finished hold must not tick it straight back on.
    fireEvent.pointerUp(row);
    fireEvent.click(row, { detail: 1 });
    expect(toggleComplete).toHaveBeenCalledTimes(1);
  });

  it('still ticks an unfinished chore off on a single tap', () => {
    const { toggleComplete, row } = renderToday({ isCompleted: false });

    fireEvent.pointerDown(row);
    fireEvent.pointerUp(row);
    fireEvent.click(row, { detail: 1 });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-1');
  });

  it('lets a keyboard un-tick without a hold, since a key cannot be held', () => {
    const { toggleComplete, row } = renderToday({ isCompleted: true });

    // Enter and Space arrive as a click with detail 0.
    fireEvent.click(row, { detail: 0 });

    expect(toggleComplete).toHaveBeenCalledWith('chore-1', 'kid-1');
  });
});

/**
 * Two fingers on a hallway wall. Both rows are finished, so both take a hold
 * to un-tick, and the two presses overlap.
 */
function renderTwoFinished() {
  const toggleComplete = vi.fn(async () => {});
  const named = (id: string, name: string): ChoreDefinition => ({ ...chore(3), id, name });
  const assignments: ResolvedAssignment[] = [
    { chore: named('chore-a', 'Feed the cat'), memberId: 'kid-1', isCompleted: true, groupIds: [] },
    { chore: named('chore-b', 'Water the plants'), memberId: 'kid-1', isCompleted: true, groupIds: [] },
  ];
  render(wrap(
    <TodayView
      config={config()}
      data={{ members: [noah], todayAssignments: assignments, memberStats: stats, toggleComplete }}
      fontSize={16}
    />,
  ));
  return {
    toggleComplete,
    rowA: screen.getByRole('button', { name: /Feed the cat/ }),
    rowB: screen.getByRole('button', { name: /Water the plants/ }),
  };
}

describe('two fingers on the wall at once', () => {
  it('does not un-tick the row the second finger landed on', () => {
    const { toggleComplete, rowA, rowB } = renderTwoFinished();

    // A held for 600ms, then a second finger touches B.
    fireEvent.pointerDown(rowA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerDown(rowB, { pointerId: 2 });
    act(() => { vi.advanceTimersByTime(100); });

    expect(toggleComplete).not.toHaveBeenCalledWith('chore-b', 'kid-1');
  });

  it('finishes the hold on the row the first finger actually held', () => {
    const { toggleComplete, rowA, rowB } = renderTwoFinished();

    fireEvent.pointerDown(rowA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerDown(rowB, { pointerId: 2 });
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });

    expect(toggleComplete).toHaveBeenCalledWith('chore-a', 'kid-1');
    expect(toggleComplete).toHaveBeenCalledTimes(1);
  });

  it('gives the second finger no credit for time it did not hold', () => {
    const { toggleComplete, rowA, rowB } = renderTwoFinished();

    // A holds almost to the line, then lifts; B presses and lifts straight
    // after. B borrowed nothing, so nothing is un-ticked.
    fireEvent.pointerDown(rowA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(690); });
    fireEvent.pointerUp(rowA, { pointerId: 1 });
    fireEvent.pointerDown(rowB, { pointerId: 2 });
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.pointerUp(rowB, { pointerId: 2 });

    expect(toggleComplete).not.toHaveBeenCalled();
  });

  it('lets the second finger hold for itself once the first is done', () => {
    const { toggleComplete, rowA, rowB } = renderTwoFinished();

    fireEvent.pointerDown(rowA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });
    fireEvent.pointerUp(rowA, { pointerId: 1 });
    expect(toggleComplete).toHaveBeenCalledWith('chore-a', 'kid-1');

    fireEvent.pointerDown(rowB, { pointerId: 2 });
    act(() => { vi.advanceTimersByTime(UNCHECK_HOLD_MS); });

    expect(toggleComplete).toHaveBeenCalledWith('chore-b', 'kid-1');
  });

  it('tells the second finger why its press did nothing', () => {
    const { rowA, rowB } = renderTwoFinished();

    fireEvent.pointerDown(rowA, { pointerId: 1 });
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.pointerDown(rowB, { pointerId: 2 });
    fireEvent.pointerUp(rowB, { pointerId: 2 });

    expect(screen.getByRole('status').textContent).toBe('Press and hold to un-check');
  });
});

describe('what a chore is worth', () => {
  it('shows the ticket value when show points is on', () => {
    renderToday({ points: 3 });

    expect(screen.getByTestId('chore-ticket-value').textContent).toContain('3');
  });

  it('shows nothing when show points is off', () => {
    renderToday({ points: 3, cfg: { showPoints: false } });

    expect(screen.queryByTestId('chore-ticket-value')).toBeNull();
  });

  it('shows nothing for a chore worth no tickets', () => {
    renderToday({ points: 0 });

    expect(screen.queryByTestId('chore-ticket-value')).toBeNull();
  });
});
