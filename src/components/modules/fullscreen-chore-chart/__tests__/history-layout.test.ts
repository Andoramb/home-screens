import { describe, it, expect } from 'vitest';
import type { RewardRedemption } from '@/lib/reward-data';
import type { RedemptionGroup } from '@/lib/reward-history';
import { splitGroupsAt } from '../rewards/historyLayout';

const rows = (prefix: string, n: number): RewardRedemption[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, rewardId: 'r', rewardName: 'Candy', memberId: 'm', memberName: 'Kid', cost: 1, redeemedAt: '2026-09-20T00:00:00Z' }));
const ids = (groups: RedemptionGroup[]) => groups.map((g) => [g.bucket, g.redemptions.map((r) => r.id)]);

// 100px rows, 20px labels, 30px between groups.
const split = (groups: RedemptionGroup[], height: number) => splitGroupsAt(groups, height, 100, 20, 30);

describe('splitGroupsAt', () => {
  const groups: RedemptionGroup[] = [
    { bucket: 'today', redemptions: rows('t', 2) },
    { bucket: 'thisWeek', redemptions: rows('w', 4) },
    { bucket: 'earlier', redemptions: rows('e', 1) },
  ];

  it('keeps everything in the first column when it fits', () => {
    const [left, right] = split(groups, 2000);
    expect(ids(left)).toEqual(ids(groups));
    expect(right).toEqual([]);
  });

  it('cuts a group across the columns and labels both halves', () => {
    // today: 20 + 200. thisWeek: 30 + 20, then 2 rows fit in the 230 left.
    const [left, right] = split(groups, 500);
    expect(ids(left)).toEqual([['today', ['t0', 't1']], ['thisWeek', ['w0', 'w1']]]);
    expect(ids(right)).toEqual([['thisWeek', ['w2', 'w3']], ['earlier', ['e0']]]);
  });

  it('never leaves a label alone at the bottom of the first column', () => {
    // After today there is room for the next label but not for a row under it.
    const [left, right] = split(groups, 300);
    expect(ids(left)).toEqual([['today', ['t0', 't1']]]);
    expect(right[0].redemptions).toHaveLength(4);
  });

  it('shows one column until the box has been measured', () => {
    expect(split(groups, 0)).toEqual([groups, []]);
  });
});
