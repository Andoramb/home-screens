import type { RedemptionGroup } from '@/lib/reward-history';

/**
 * Cuts the grouped feed where the first column is full. A group that straddles
 * the cut appears in both columns under its own label, and a label is never
 * left as the last thing in a column.
 */
export function splitGroupsAt(groups: RedemptionGroup[], height: number, rowPx: number, labelPx: number, gapPx: number): [RedemptionGroup[], RedemptionGroup[]] {
  if (height <= 0) return [groups, []];
  const left: RedemptionGroup[] = [];
  const right: RedemptionGroup[] = [];
  let used = 0;
  let full = false;
  for (const group of groups) {
    if (full) { right.push(group); continue; }
    const header = labelPx + (left.length > 0 ? gapPx : 0);
    const room = Math.floor((height - used - header) / rowPx);
    if (room >= group.redemptions.length) {
      left.push(group);
      used += header + group.redemptions.length * rowPx;
      continue;
    }
    full = true;
    if (room > 0) left.push({ bucket: group.bucket, redemptions: group.redemptions.slice(0, room) });
    right.push({ bucket: group.bucket, redemptions: group.redemptions.slice(Math.max(room, 0)) });
  }
  return [left, right];
}
