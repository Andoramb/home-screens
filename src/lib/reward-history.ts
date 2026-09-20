import type { RewardRedemption } from './reward-data';
import { sortRedemptionsNewestFirst } from './reward-rules';

/**
 * How a family's redemptions are read back on the wall: split by how long ago
 * they happened, and summed up for the totals tiles. The card chart, the three
 * full-screen history views and the store's own history all list the same
 * rows, so the grouping and the sums live here rather than in any one of them.
 */

export type RedemptionBucket = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

export const REDEMPTION_BUCKETS: readonly RedemptionBucket[] = ['today', 'yesterday', 'thisWeek', 'earlier'];

export interface RedemptionGroup {
  bucket: RedemptionBucket;
  redemptions: RewardRedemption[];
}

const DAY_MS = 86_400_000;

/** Midnight at the start of the local day `date` falls in. */
function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Whole local calendar days between a redemption and now. Calendar days, not
 * 24-hour spans: something redeemed at 9pm is "yesterday" at 7am.
 */
function daysAgo(redeemedAt: string, now: Date): number | null {
  const at = new Date(redeemedAt);
  if (Number.isNaN(at.getTime())) return null;
  return Math.round((startOfLocalDay(now) - startOfLocalDay(at)) / DAY_MS);
}

function bucketFor(days: number | null): RedemptionBucket {
  // A row that cannot be dated, or one stamped in the future by a clock that
  // was wrong, still has to land somewhere it can be seen.
  if (days === null) return 'earlier';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return days < 7 ? 'thisWeek' : 'earlier';
}

/** Newest first, split into the buckets that have anything in them, in order. */
export function groupRedemptionsByDay(redemptions: readonly RewardRedemption[], now: Date): RedemptionGroup[] {
  const byBucket = new Map<RedemptionBucket, RewardRedemption[]>();
  for (const redemption of sortRedemptionsNewestFirst(redemptions)) {
    const bucket = bucketFor(daysAgo(redemption.redeemedAt, now));
    const list = byBucket.get(bucket);
    if (list) list.push(redemption);
    else byBucket.set(bucket, [redemption]);
  }
  return REDEMPTION_BUCKETS.flatMap((bucket) => {
    const list = byBucket.get(bucket);
    return list ? [{ bucket, redemptions: list }] : [];
  });
}

export interface RedemptionSummary {
  ticketsSpent: number;
  count: number;
  /** The reward redeemed most often. A tie goes to the one redeemed most recently. */
  favorite: { rewardName: string; count: number } | null;
}

/** How many days the totals tiles look back. */
export const SUMMARY_DAYS = 30;

export function summarizeRedemptions(redemptions: readonly RewardRedemption[], now: Date, days = SUMMARY_DAYS): RedemptionSummary {
  const recent = sortRedemptionsNewestFirst(redemptions).filter((r) => {
    const ago = daysAgo(r.redeemedAt, now);
    return ago !== null && ago < days;
  });
  // Counted by name, not id: a reward that was deleted and made again is the
  // same treat to the family. Map order is newest first, which settles ties.
  const counts = new Map<string, number>();
  for (const r of recent) counts.set(r.rewardName, (counts.get(r.rewardName) ?? 0) + 1);
  let favorite: RedemptionSummary['favorite'] = null;
  for (const [rewardName, count] of counts) {
    if (!favorite || count > favorite.count) favorite = { rewardName, count };
  }
  return { ticketsSpent: recent.reduce((sum, r) => sum + r.cost, 0), count: recent.length, favorite };
}
