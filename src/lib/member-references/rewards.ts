import { FamilyError } from '@/lib/family-errors';
import { validFamilyId } from '@/lib/family-merge';
import { HISTORICAL_ORPHANS_POLICY } from './chore-completions';
import { checkedIds, isRecord, recordLabel, rows, stripIds, withoutKeys, type Doc, type MemberReferenceDomain, type RestorePlan } from './contract';

export const REWARD_REPAIR_POLICY = 'remove-missing-members-disable-if-none-remain';

/**
 * Rewards: `memberIds` on a reward says who may redeem it (empty means
 * everyone), `balances` holds each person's points, and `redemptions` are
 * history with the person's id and name copied in.
 *
 * Removal takes the person off every reward and drops their balance;
 * redemptions keep their ids because they are facts about the past.
 *
 * Restore repairs eligibility a failed legacy deletion left behind: missing
 * people come off a reward, and a reward left with nobody is disabled rather
 * than widened to everyone. Orphaned balances are kept as a ledger and
 * recorded, like chore history.
 */
export const rewardReferences: MemberReferenceDomain = {
  path: 'data/rewards.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = structuredClone(doc);
    if (!Array.isArray(next.rewards)) throw new FamilyError('The saved rewards are invalid.', 409);
    next.balances = withoutKeys(next.balances, removed);
    next.rewards = next.rewards.map((reward: Doc) => ({ ...reward, memberIds: stripIds(reward.memberIds, removed) }));
    return next;
  },
  planRestore(doc, members): RestorePlan {
    const repairs: { before: Doc; removedMemberIds: string[]; disabled: boolean }[] = [];
    const rewards = rows(doc.rewards, 'Rewards').map((reward, index) => {
      const ids = checkedIds(reward.memberIds, `${recordLabel('data/rewards.json', `rewards[${index}]`, reward)}, memberIds`);
      const removedMemberIds = [...new Set(ids.filter((id) => !members.has(id)))];
      if (removedMemberIds.length === 0) return reward;
      const memberIds = ids.filter((id) => members.has(id));
      const disabled = memberIds.length === 0;
      repairs.push({ before: reward, removedMemberIds, disabled });
      return { ...reward, memberIds, ...(disabled ? { enabled: false } : {}) };
    });
    if (!isRecord(doc.balances)) throw new Error('Reward balances must be a member mapping.');
    const orphanedBalances: Record<string, number> = {};
    for (const [id, balance] of Object.entries(doc.balances)) {
      if (!validFamilyId(id)) throw new Error('A reward balance needs a valid member identity.');
      if (typeof balance !== 'number' || !Number.isFinite(balance)) throw new Error('A reward balance must be a finite number.');
      if (!members.has(id)) orphanedBalances[id] = balance;
    }
    rows(doc.redemptions, 'Reward redemptions');
    const evidence: RestorePlan['evidence'] = {};
    if (Object.keys(orphanedBalances).length > 0) evidence.historicalOrphans = { policy: HISTORICAL_ORPHANS_POLICY, balances: orphanedBalances };
    if (repairs.length > 0) evidence.rewardAssignmentRepairs = { policy: REWARD_REPAIR_POLICY, records: repairs };
    return { ...(repairs.length > 0 ? { doc: { ...doc, rewards } } : {}), missing: [], evidence };
  },
};
