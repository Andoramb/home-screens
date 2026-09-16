import { describe, it, expect } from 'vitest';
import type { RewardDefinition } from '../reward-data';
import {
  isRewardEligibleFor,
  isRewardOfferedTo,
  canAffordReward,
  ticketsStillNeeded,
  ticketsAfterRedeeming,
} from '../reward-rules';

const reward = (overrides: Partial<RewardDefinition> = {}): RewardDefinition =>
  ({ id: 'r-1', name: 'Movie night', cost: 10, enabled: true, memberIds: [], ...overrides }) as RewardDefinition;

describe('isRewardEligibleFor', () => {
  it('offers an unrestricted reward to everyone, including nobody in particular', () => {
    expect(isRewardEligibleFor(reward(), 'kid-1')).toBe(true);
    expect(isRewardEligibleFor(reward(), null)).toBe(true);
  });

  it('offers a restricted reward only to the people named', () => {
    const restricted = reward({ memberIds: ['kid-1'] });
    expect(isRewardEligibleFor(restricted, 'kid-1')).toBe(true);
    expect(isRewardEligibleFor(restricted, 'kid-2')).toBe(false);
  });

  /* The wall's store starts with nobody picked. A restricted reward must not
   * show up before somebody says who they are. */
  it('withholds a restricted reward while nobody is selected', () => {
    expect(isRewardEligibleFor(reward({ memberIds: ['kid-1'] }), null)).toBe(false);
  });
});

describe('isRewardOfferedTo', () => {
  it('needs the reward switched on as well as meant for them', () => {
    expect(isRewardOfferedTo(reward(), 'kid-1')).toBe(true);
    expect(isRewardOfferedTo(reward({ enabled: false }), 'kid-1')).toBe(false);
    expect(isRewardOfferedTo(reward({ memberIds: ['kid-2'] }), 'kid-1')).toBe(false);
  });
});

describe('canAffordReward', () => {
  it('counts an exact balance as enough', () => {
    expect(canAffordReward(10, reward({ cost: 10 }))).toBe(true);
    expect(canAffordReward(9, reward({ cost: 10 }))).toBe(false);
    expect(canAffordReward(11, reward({ cost: 10 }))).toBe(true);
  });

  it('handles a member with no balance recorded yet', () => {
    expect(canAffordReward(0, reward({ cost: 1 }))).toBe(false);
    expect(canAffordReward(0, reward({ cost: 0 }))).toBe(true);
  });
});

describe('ticket counts', () => {
  it('says how many more are needed, never a negative number', () => {
    expect(ticketsStillNeeded(4, reward({ cost: 10 }))).toBe(6);
    expect(ticketsStillNeeded(12, reward({ cost: 10 }))).toBe(0);
  });

  it('says what would be left over, never a negative number', () => {
    expect(ticketsAfterRedeeming(12, reward({ cost: 10 }))).toBe(2);
    expect(ticketsAfterRedeeming(4, reward({ cost: 10 }))).toBe(0);
  });
});
