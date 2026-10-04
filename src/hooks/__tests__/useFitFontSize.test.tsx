// @vitest-environment jsdom

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useFitFontSize } from '@/hooks/useFitFontSize';

/**
 * jsdom lays nothing out, so the "browser" here is a pair of getters: an
 * element's height is its `data-h`. The content is `rows * 5` lines of the
 * fitted size tall in a 360px box, which is all the hook measures.
 */
const BOX = 360;
const descriptors = ['clientHeight', 'offsetHeight', 'scrollHeight'].map((prop) => [prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)] as const);
const realResizeObserver = globalThis.ResizeObserver;

beforeAll(() => {
  for (const [prop] of descriptors) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) { return Number(this.dataset.h ?? 0); },
    });
  }
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

afterAll(() => {
  for (const [prop, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  }
  globalThis.ResizeObserver = realResizeObserver;
  cleanup();
});

/** The size the hook settled on, as the harness last rendered it. */
const fitted = () => Number(document.querySelector('[data-font]')?.getAttribute('data-font'));

function Harness({ desired, rows }: { desired: number; rows: number }) {
  // `rows` is left out of the key on purpose: it stands for content that
  // changes under a key, as the countdown's "+N more" changes its list.
  const { boxRef, contentRef, fontSize } = useFitFontSize(desired, 'list');
  return (
    <div ref={boxRef} data-h={BOX} data-font={fontSize}>
      <div ref={contentRef} data-h={rows * 5 * fontSize} />
    </div>
  );
}

describe('useFitFontSize', () => {
  it('shrinks content that overflows to the largest size that fits', () => {
    render(<Harness desired={28} rows={4} />);
    // 20 lines in 360px: 18px at most.
    expect(fitted()).toBeLessThanOrEqual(18);
    expect(fitted()).toBeGreaterThan(17);
    cleanup();
  });

  it('refits from scratch when a size steps down and straight back up', () => {
    // Settled for three rows at 28px, then stepped to 16.8px where four rows
    // fit untouched, then straight back to 28px with four rows. The bracket
    // settled for three rows used to come back with the 28px key and pin four
    // rows at 24px, 480px of content in a 360px box.
    const { rerender } = render(<Harness desired={28} rows={3} />);
    expect(fitted() * 15).toBeLessThanOrEqual(BOX);
    act(() => { rerender(<Harness desired={16.8} rows={4} />); });
    expect(fitted()).toBe(16.8);
    act(() => { rerender(<Harness desired={28} rows={4} />); });
    expect(fitted() * 20).toBeLessThanOrEqual(BOX);
    expect(fitted()).toBeGreaterThan(17);
    cleanup();
  });
});
