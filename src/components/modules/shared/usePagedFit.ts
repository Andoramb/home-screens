'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useFontsReady } from '@/hooks/useFontsReady';

/**
 * Pages a list (or a grid) of rendered rows so nothing is clipped: the rows
 * are measured once per `measureKey`, cut into pages of whole rows that fit
 * the container's height, and the caller hides everything that is not on the
 * current page. Everything fits -> one page.
 *
 * Returns `pages` as lists of row indices, or null during a measuring pass,
 * when the caller must render every row so its height can be read.
 *
 * `measureKey` is everything that changes a row's height or the set of rows:
 * the row identities, the layout options, the font size. Leave out what only
 * changes a row's text in place (a score, a clock), because a new key starts
 * the pages over from page one. The container's box and the web fonts are
 * folded in here.
 *
 * `columns` > 1 pages a grid: rows are grouped `columns` at a time, a grid
 * row is as tall as its tallest cell, and a page holds whole grid rows.
 *
 * Three details are load-bearing and were each found the hard way in the
 * news list, where this was first written:
 * - The key is stored WITH the pages, and a stale key reads as null. On the
 *   render where the key changes, every row is already on screen for the
 *   layout effect below to measure. Resetting from a passive effect instead
 *   put a paint between the two, and the reset could land after the
 *   measurement it was meant to invalidate, which left the list stuck in its
 *   measuring pass with every row rendered and clipped at the box edge.
 * - The layout effect has no dependency array. It returns at once unless the
 *   pages are stale, so it can never miss a key change. With a list, the
 *   reset and the measurement batched into one commit, the deps came out
 *   unchanged, and the effect never ran again.
 * - The ResizeObserver compares against the box the last measurement saw,
 *   not the box the last callback reported, so the first real layout after a
 *   hidden mount (a zero-height box) still triggers a measurement.
 */
export function usePagedFit(
  rowSelector: string,
  measureKey: string,
  columns = 1,
): { ref: RefObject<HTMLDivElement | null>; pages: number[][] | null } {
  const ref = useRef<HTMLDivElement>(null);
  const [boxKey, setBoxKey] = useState('');
  const fontsReady = useFontsReady();
  const key = `${measureKey}|${boxKey}|${fontsReady}`;

  const [fit, setFit] = useState<{ key: string; pages: number[][] }>({ key: '', pages: [] });
  const pages = fit.key === key ? fit.pages : null;

  const measuredRef = useRef<{ w: number; h: number } | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- no dep list on purpose, see above
  useLayoutEffect(() => {
    if (pages !== null) return;
    const el = ref.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>(rowSelector));
    const available = el.clientHeight;
    // Not laid out yet (hidden screen, zero-height box): leave the measuring
    // pass in place and let the ResizeObserver below call us back.
    if (available <= 0 || rows.some((r) => r.offsetHeight === 0)) return;
    measuredRef.current = { w: el.clientWidth, h: el.clientHeight };
    const gap = parseFloat(getComputedStyle(el).rowGap || '0') || 0;
    setFit({ key, pages: pageRows(rows.map((r) => r.offsetHeight), available, gap, columns) });
  });

  // Re-measure when the box itself changes size (font scaling, editor resize).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const m = measuredRef.current;
      if (m && Math.abs(m.h - el.clientHeight) < 1 && Math.abs(m.w - el.clientWidth) < 1) return;
      setBoxKey(`${Math.round(el.clientWidth)}x${Math.round(el.clientHeight)}`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, pages };
}

/**
 * Cuts row heights into pages of whole rows. A row taller than the box gets a
 * page of its own rather than being dropped. Always returns at least one
 * page, so an empty list is one empty page and not "no pages".
 */
export function pageRows(heights: number[], available: number, gap: number, columns = 1): number[][] {
  const result: number[][] = [];
  let page: number[] = [];
  let used = 0;
  for (let start = 0; start < heights.length; start += columns) {
    const indices = heights.slice(start, start + columns).map((_, j) => start + j);
    const h = Math.max(...indices.map((i) => heights[i]));
    const needed = page.length === 0 ? h : used + gap + h;
    if (page.length > 0 && needed > available) {
      result.push(page);
      page = [...indices];
      used = h;
    } else {
      page.push(...indices);
      used = needed;
    }
  }
  if (page.length > 0) result.push(page);
  return result.length > 0 ? result : [[]];
}
