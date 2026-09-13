// @vitest-environment jsdom

/**
 * DayArtLayer is the whole per-pixel dimming story: the image is the
 * layer's own background and dimming is element opacity, so transparent
 * pixels contribute nothing at any dim value (a scrim layer in the cell's
 * background stack could never do this — it always covers the full box).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { DayArtLayer } from '../DayArtLayer';
import { NO_DECOR, type DayDecor } from '@/lib/calendar-rules';

const art = (over: Partial<DayDecor>): DayDecor => ({ ...NO_DECOR, backgroundImage: '/a.png', ...over });

describe('DayArtLayer', () => {
  afterEach(cleanup);

  it('paints the image with cover positioning and inherits the cell rounding', () => {
    const { container } = render(<DayArtLayer decor={art({})} />);
    const el = container.querySelector('[data-day-art]') as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.backgroundImage).toBe('url("/a.png")');
    expect(el.style.backgroundSize).toBe('cover');
    expect(el.style.backgroundPosition).toBe('center center');
    expect(el.style.borderRadius).toBe('inherit');
  });

  it('maps dimming to opacity: default 0.4 dim renders at 0.6, 0.7 dim at 0.3', () => {
    const { container } = render(
      <>
        <DayArtLayer decor={art({})} />
        <DayArtLayer decor={art({ backgroundDim: 0.7 })} />
        <DayArtLayer decor={art({ backgroundDim: 0 })} />
      </>,
    );
    const els = container.querySelectorAll<HTMLElement>('[data-day-art]');
    expect(els[0].style.opacity).toBe('0.6');
    expect(els[1].style.opacity).toBe('0.3');
    expect(els[2].style.opacity).toBe('1');
  });
});
