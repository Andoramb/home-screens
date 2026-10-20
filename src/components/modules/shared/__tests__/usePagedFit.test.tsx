import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { usePagedFit, pageRows } from '../usePagedFit';

// @vitest-environment jsdom

describe('pageRows', () => {
  it('fills pages with whole rows, counting the gap between them', () => {
    // 30+10+30 = 70 fits, 70+10+30 = 110 does not.
    expect(pageRows([30, 30, 30, 30, 30], 100, 10)).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('is one page when everything fits', () => {
    expect(pageRows([30, 30], 100, 10)).toEqual([[0, 1]]);
  });

  it('gives a row taller than the box a page of its own instead of dropping it', () => {
    expect(pageRows([30, 500, 30], 100, 0)).toEqual([[0], [1], [2]]);
  });

  it('is one empty page for no rows', () => {
    expect(pageRows([], 100, 0)).toEqual([[]]);
  });

  it('pages a grid by whole grid rows, as tall as the tallest cell', () => {
    // Two columns: rows (0,1) 40 tall, (2,3) 60 tall, (4) 40 tall; 40+60 fits exactly.
    expect(pageRows([40, 30, 60, 20, 40], 100, 0, 2)).toEqual([[0, 1, 2, 3], [4]]);
  });
});

/** Rows whose offsetHeight jsdom cannot lay out; the test sets them by hand. */
function Rows({ heights, box, columns = 1 }: { heights: number[]; box: number; columns?: number }) {
  const { ref, pages } = usePagedFit('[data-row]', heights.join(','), columns);
  return (
    <div ref={ref} data-pages={pages ? JSON.stringify(pages) : 'measuring'} data-box={box}>
      {heights.map((h, i) => <div key={i} data-row data-h={h} />)}
    </div>
  );
}

describe('usePagedFit', () => {
  beforeAll(() => {
    class RO { observe() {} unobserve() {} disconnect() {} }
    (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() { return Number((this as HTMLElement).dataset.h ?? 0); },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() { return Number((this as HTMLElement).dataset.box ?? 0); },
    });
  });
  afterEach(cleanup);

  it('measures the rendered rows into pages once the fonts are in', async () => {
    const { container } = render(<Rows heights={[30, 30, 30]} box={70} />);
    const el = container.firstElementChild as HTMLElement;
    await act(async () => {});
    expect(JSON.parse(el.dataset.pages!)).toEqual([[0, 1], [2]]);
  });

  it('re-measures when the rows change and keeps the pages when they do not', async () => {
    const { container, rerender } = render(<Rows heights={[30, 30, 30]} box={70} />);
    const el = container.firstElementChild as HTMLElement;
    await act(async () => {});
    const first = el.dataset.pages;
    rerender(<Rows heights={[30, 30, 30]} box={70} />);
    expect(el.dataset.pages).toBe(first);
    rerender(<Rows heights={[30, 30]} box={70} />);
    await act(async () => {});
    expect(JSON.parse(el.dataset.pages!)).toEqual([[0, 1]]);
  });

  it('stays in the measuring pass while the box has no height', async () => {
    const { container } = render(<Rows heights={[30]} box={0} />);
    const el = container.firstElementChild as HTMLElement;
    await act(async () => {});
    expect(el.dataset.pages).toBe('measuring');
  });
});
