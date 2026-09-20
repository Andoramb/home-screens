
import type { FamilyMember } from '@/types/family';
import { describe, it, expect } from 'vitest';
import { balanceRows, choreDotGap, choreDotRunWidth, choreDotSize, choreTapSize, fitChoreFontSize, fitPerRow, fitStoreFontSize, partitionMembers, resolveHistoryLimit, starIconSize, storeRailEm, storeRailShowsBalances, storeTileColumns, storeUsesRail, weekMembers, type StoreFitInput } from '../layout';
import type { MemberStats } from '../types';


function stats(total: number, weekAssigned: number): MemberStats {
  return { total, completed: 0, percentage: 0, streak: 0, weeklyPoints: 0, weeklyPointsTotal: 0, rewardBalance: 0, weekAssigned };
}

const member = (id: string): FamilyMember => ({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', id, name: id, emoji: '', color: '#fff' });

describe('balanceRows', () => {
  it('keeps everything on one row when it fits', () => {
    expect(balanceRows([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(balanceRows([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('spreads a remainder across rows instead of leaving a lone trailing item', () => {
    expect(balanceRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5], [6, 7]]);
    expect(balanceRows([1, 2, 3, 4], 3)).toEqual([[1, 2], [3, 4]]);
    expect(balanceRows([1, 2, 3, 4, 5], 4)).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('splits evenly when the count divides', () => {
    expect(balanceRows([1, 2, 3, 4, 5, 6], 3)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it('never returns an empty row and tolerates a zero or fractional limit', () => {
    expect(balanceRows([], 3)).toEqual([]);
    expect(balanceRows([1, 2], 0)).toEqual([[1], [2]]);
    expect(balanceRows([1, 2, 3], 2.9)).toEqual([[1, 2], [3]]);
  });
});

describe('fitPerRow', () => {
  it('counts how many items fit with gaps between them', () => {
    // 468px wide, 144px items, 8px gaps: 3 fit (3*144 + 2*8 = 448), 4 do not.
    expect(fitPerRow(468, 144, 8, 6)).toBe(3);
    expect(fitPerRow(900, 144, 8, 6)).toBe(5);
  });

  it('never exceeds the item count and never drops below one', () => {
    expect(fitPerRow(2000, 144, 8, 2)).toBe(2);
    expect(fitPerRow(100, 144, 8, 6)).toBe(1);
  });

  it('fits everything on one row while the width is unmeasured', () => {
    expect(fitPerRow(0, 144, 8, 6)).toBe(6);
  });
});

describe('partitionMembers', () => {
  const m = new Map<string, MemberStats>([
    ['kid', stats(3, 12)],
    ['rest', stats(0, 4)],
    ['parent', stats(0, 0)],
  ]);
  const members = [member('parent'), member('kid'), member('rest'), member('unknown')];

  it('splits members into active, day off, and idle', () => {
    const { active, dayOff, idle } = partitionMembers(members, m);
    expect(active.map((x) => x.id)).toEqual(['kid']);
    expect(dayOff.map((x) => x.id)).toEqual(['rest']);
    expect(idle.map((x) => x.id)).toEqual(['parent', 'unknown']);
  });

  it('keeps the household order within each group', () => {
    const { idle } = partitionMembers([member('unknown'), member('parent')], m);
    expect(idle.map((x) => x.id)).toEqual(['unknown', 'parent']);
  });

  it('charts everyone with chores this week, in order', () => {
    expect(weekMembers(members, m).map((x) => x.id)).toEqual(['kid', 'rest']);
  });
});

describe('assignee dots on a today row', () => {
  it('keeps a fingertip floor however small the chart is fitted', () => {
    expect(choreDotSize(11)).toBe(24);
    expect(choreDotSize(4)).toBe(24);
  });

  it('stops growing, so five dots never take the width the chore name needs', () => {
    expect(choreDotSize(40)).toBe(40);
    expect(choreDotSize(200)).toBe(40);
  });

  it('scales with the fitted type between those bounds', () => {
    expect(choreDotSize(22)).toBe(33);
  });

  it('measures a run of dots with its gaps, and nothing for an empty run', () => {
    const size = choreDotSize(22);
    const gap = choreDotGap(size);
    expect(choreDotRunWidth(size, 0)).toBe(0);
    expect(choreDotRunWidth(size, 1)).toBe(size);
    expect(choreDotRunWidth(size, 5)).toBe(5 * size + 4 * gap);
  });

  it('keeps the gap visible at the smallest dot, so five rings do not read as one blob', () => {
    expect(choreDotGap(choreDotSize(11))).toBeGreaterThanOrEqual(3);
  });
});

describe('fitChoreFontSize', () => {
  const day = { width: 476, height: 626, requested: 24, rows: 10, sections: 4, view: 'today' };

  it('shrinks a busy day to fit its own default card', () => {
    // Ten chores at the module's 24px default need ~780px of rows; the card
    // is 650. Before this the last three were cut off mid-row.
    const fitted = fitChoreFontSize(day);
    expect(fitted).toBeLessThan(24);
    // The list, at the size it settled on, fits the box it was given. A
    // `today` row is its assignee dot plus the view's own 0.7em of padding.
    const rowPx = choreDotSize(fitted) + 0.7 * fitted;
    const gaps = (day.sections - 1) * 8;
    expect(day.rows * rowPx + day.sections * 1.9 * fitted + 3.7 * fitted + gaps)
      .toBeLessThanOrEqual(day.height);
  });

  it('accounts for the tap target refusing to shrink past its own floor', () => {
    // Rows stop shrinking with the type once the dot hits its 24px floor,
    // so the fit has to search rather than divide: at 14 chores a closed-form
    // solve returns a size whose rows still overflow.
    const fitted = fitChoreFontSize({ ...day, rows: 12, sections: 4 });
    const rowPx = choreDotSize(fitted) + 0.7 * fitted;
    expect(12 * rowPx + 4 * 1.9 * fitted + 3.7 * fitted + 24).toBeLessThanOrEqual(day.height);
  });

  it('bottoms out at the floor when no size can fit the day, leaving the rest to the list', () => {
    // Twenty rows cannot fit 626px even at the floor: the list scrolls and
    // says how many are below it (see FitRows) instead of vanishing.
    expect(fitChoreFontSize({ ...day, rows: 20, sections: 4 })).toBe(11);
  });

  it('leaves a light day at the size the household asked for', () => {
    expect(fitChoreFontSize({ ...day, rows: 3, sections: 2 })).toBe(24);
  });

  it('never exceeds the module font size, however big the box', () => {
    expect(fitChoreFontSize({ ...day, width: 4000, height: 4000, rows: 1, sections: 1 })).toBe(24);
  });

  it('stops shrinking at a readable floor rather than vanishing', () => {
    expect(fitChoreFontSize({ ...day, height: 120, rows: 30, sections: 4 })).toBe(11);
  });

  it('keeps the authored size until the box has been measured', () => {
    expect(fitChoreFontSize({ ...day, width: 0, height: 0 })).toBe(24);
  });

  it('leaves room for compact\'s member header and totals legend', () => {
    // Compact draws shorter rows than the list views but carries far more
    // chrome, so the fit has to budget for the chrome, not just the rows.
    const compact = fitChoreFontSize({ ...day, view: 'compact', sections: 0 });
    expect(day.rows * (choreTapSize(compact) + 0.5 * compact) + 9 * compact)
      .toBeLessThanOrEqual(day.height);
  });
});

describe('choreTapSize', () => {
  it('keeps a fingertip target while the type allows one', () => {
    expect(choreTapSize(24)).toBe(38);
  });

  it('shrinks with the type rather than pushing chores off the bottom', () => {
    expect(choreTapSize(16)).toBeLessThan(38);
  });

  it('never goes below a size a child can hit', () => {
    expect(choreTapSize(11)).toBe(24);
  });
});

describe('fitChoreFontSize, star chart', () => {
  // rows = charted members, sections = legend rows.
  const chart = { width: 476, height: 626, requested: 24, rows: 5, sections: 1, view: 'star-chart' };

  it('keeps seven days of stars inside the width rather than squeezing the columns', () => {
    // The name column plus seven day columns need about 20em across; the list
    // views' 13em let the table run past its own box.
    expect(fitChoreFontSize({ ...chart, width: 300 })).toBeLessThanOrEqual(300 / 20);
  });

  it('shrinks for a bigger household', () => {
    const five = fitChoreFontSize(chart);
    const seven = fitChoreFontSize({ ...chart, rows: 7, sections: 2, height: 300, width: 300 });
    expect(seven).toBeLessThan(five);
  });

  it('bottoms out at the floor when the household cannot fit', () => {
    // Ten kids in a 300x300 card is past any size that helps: it stops at the
    // floor and FitRows says how many are below.
    expect(fitChoreFontSize({ ...chart, rows: 10, sections: 3, width: 300, height: 300 })).toBe(11);
  });

  it('leaves the authored size alone when the chart already fits', () => {
    expect(fitChoreFontSize({ ...chart, rows: 2, sections: 1, width: 900, height: 900 })).toBe(24);
  });
});

describe('starIconSize', () => {
  it('scales the member icon with the chart instead of pinning it at 18px', () => {
    expect(starIconSize(24)).toBeGreaterThan(starIconSize(12));
  });

  it('stays visible at the floor and never dwarfs a big chart', () => {
    expect(starIconSize(4)).toBe(10);
    expect(starIconSize(100)).toBe(22);
  });
});


describe('fitChoreFontSize, reward history', () => {
  const card = { width: 476, height: 626, requested: 24, sections: 0, view: 'reward-history' };

  it('leaves a short history at the size the household asked for when the card is wide enough', () => {
    expect(fitChoreFontSize({ ...card, width: 900, rows: 5 })).toBe(24);
  });

  it('holds the type to what four columns of words can fit across the card', () => {
    expect(fitChoreFontSize({ ...card, rows: 5 })).toBeCloseTo(476 / 24, 5);
  });

  it('shrinks a long history so every row it promises fits the card', () => {
    const fitted = fitChoreFontSize({ ...card, rows: 20 });
    expect(fitted).toBeLessThan(24);
    expect(fitted).toBeGreaterThan(11);
    // A row is 2em plus its 1px rule; the title and the pill strip are 4.1em.
    expect(20 * (2 * fitted + 1) + 4.1 * fitted).toBeLessThanOrEqual(card.height);
  });
});

describe('resolveHistoryLimit', () => {
  it('falls back to five when the value is missing or not a number', () => {
    for (const raw of [undefined, null, 'abc', NaN, Infinity]) expect(resolveHistoryLimit(raw)).toBe(5);
  });

  it('keeps a whole number inside one to fifty', () => {
    expect(resolveHistoryLimit(12)).toBe(12);
    expect(resolveHistoryLimit(5.5)).toBe(5);
    expect(resolveHistoryLimit(0)).toBe(1);
    expect(resolveHistoryLimit(500)).toBe(50);
  });
});

describe('fitStoreFontSize', () => {
  const card: StoreFitInput = { width: 468, height: 618, requested: 24, layout: 'list', count: 8, showTitle: true, showPicker: true, members: 6, showBalance: true, readOnly: false };

  it('shrinks the type until the rewards fit under the picker', () => {
    const fitted = fitStoreFontSize({ ...card, count: 7 });
    expect(fitted).toBeLessThan(24);
    expect(fitted).toBeGreaterThan(18);
  });

  it('leaves a short list at the size the household asked for', () => {
    expect(fitStoreFontSize({ ...card, count: 3 })).toBe(24);
  });

  it('lets a read-only list keep shrinking to show everything, where pills would stop and scroll', () => {
    const readOnly = fitStoreFontSize({ ...card, count: 12, readOnly: true });
    expect(readOnly).toBeGreaterThan(11);
    expect(readOnly).toBeLessThan(18);
    expect(fitStoreFontSize({ ...card, count: 12 })).toBe(18);
  });

  it('stops at a floor that still reads beside a 44px pill, and lower when there are no pills', () => {
    expect(fitStoreFontSize({ ...card, count: 40 })).toBe(18);
    expect(fitStoreFontSize({ ...card, count: 40, readOnly: true })).toBe(11);
  });

  it('never lifts the type above what the household asked for', () => {
    expect(fitStoreFontSize({ ...card, requested: 14, count: 40 })).toBe(14);
  });

  it('gives the rewards the whole height once the picker moves to the rail', () => {
    const wide = { ...card, width: 868, height: 328, count: 4 };
    expect(storeUsesRail(wide.width, wide.height)).toBe(true);
    expect(fitStoreFontSize(wide)).toBeGreaterThan(20);
    // The same four rewards under a stacked picker bottom out.
    expect(fitStoreFontSize({ ...wide, width: 600 })).toBe(18);
  });

  it('shrinks for the rail too: seven people beside one reward in a very short card', () => {
    // One reward fits 208px at any size, so the type used to stay at 24px and
    // the third row of avatars and the balance ran off the bottom of the card.
    const short = { ...card, width: 868, height: 228, count: 1, members: 7 };
    const fitted = fitStoreFontSize(short);
    expect(fitted).toBeLessThan(24);
    expect(fitted).toBeGreaterThan(18);
    expect((1.5 + 0.5 + storeRailEm(7, false)) * fitted).toBeLessThanOrEqual(228 + 0.01);
    // At that size there is no room for a balance under each avatar as well.
    expect(storeRailShowsBalances(7, 228, fitted, true)).toBe(false);
    expect(storeRailShowsBalances(3, 328, 20, true)).toBe(true);
    // Shorter still and it stops at the floor that keeps avatars tappable;
    // the rail scrolls from there, with the balance at its top.
    expect(fitStoreFontSize({ ...short, height: 180 })).toBe(18);
  });

  it('keeps the authored size until the box has been measured', () => {
    expect(fitStoreFontSize({ ...card, width: 0, height: 0 })).toBe(24);
  });
});

describe('storeTileColumns', () => {
  it('goes three across in the default card and never below two or above four', () => {
    expect(storeTileColumns(468, 18)).toBe(3);
    expect(storeTileColumns(200, 24)).toBe(2);
    expect(storeTileColumns(2000, 12)).toBe(4);
  });
});

describe('storeUsesRail', () => {
  it('is for wide, short cards only', () => {
    expect(storeUsesRail(468, 618)).toBe(false);
    expect(storeUsesRail(868, 328)).toBe(true);
    // Wide in shape but too narrow to give up 13em.
    expect(storeUsesRail(500, 250)).toBe(false);
  });
});
