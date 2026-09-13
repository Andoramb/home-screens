// @vitest-environment jsdom

/**
 * DayArtLayer is the whole per-pixel dimming story: the image is the
 * layer's own background and dimming is element opacity, so transparent
 * pixels contribute nothing at any dim value (a scrim layer in the cell's
 * background stack could never do this, it always covers the full box).
 * It also has to sit under the cell's content and, for uploaded art, fetch
 * the picture with the display token like every other API-served image.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React from 'react';
import { DayArtLayer } from '../DayArtLayer';
import { NO_DECOR, type DayDecor } from '@/lib/calendar-rules';

const displayFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/display-fetch', () => ({ displayFetch }));

const art = (over: Partial<DayDecor>): DayDecor => ({ ...NO_DECOR, backgroundImage: '/a.png', ...over });

describe('DayArtLayer', () => {
  beforeEach(() => {
    displayFetch.mockReset();
    // jsdom has no object URLs; the hook only needs a stable string back.
    URL.createObjectURL = vi.fn(() => 'blob:art');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(cleanup);

  it('paints the image with cover positioning under the cell content and inherits the cell rounding', () => {
    const { container } = render(<DayArtLayer decor={art({})} />);
    const el = container.querySelector('[data-day-art]') as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.backgroundImage).toBe('url("/a.png")');
    expect(el.style.backgroundSize).toBe('cover');
    expect(el.style.backgroundPosition).toBe('center center');
    expect(el.style.borderRadius).toBe('inherit');
    // Below the in-flow digits and event pills; mergeCellDecor isolates the
    // cell so this stays above the cell's own background.
    expect(el.style.zIndex).toBe('-1');
    // A static path never needs the display token.
    expect(displayFetch).not.toHaveBeenCalled();
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

  it('fetches uploaded art through the display token and paints the blob', async () => {
    let resolveFetch: (res: unknown) => void = () => {};
    displayFetch.mockImplementation(() => new Promise((r) => { resolveFetch = r; }));
    const serve = '/api/backgrounds/serve?file=calendar-art%2Fparty.png';
    const { container } = render(<DayArtLayer decor={art({ backgroundImage: serve })} />);

    // Nothing paints until the bytes arrive: a raw serve URL in CSS would
    // be a 401 on a password-protected wall.
    expect(container.querySelector('[data-day-art]')).toBeNull();
    expect(displayFetch).toHaveBeenCalledWith(serve);

    await act(async () => {
      resolveFetch({ ok: true, blob: async () => new Blob(['x']) });
    });
    const el = container.querySelector('[data-day-art]') as HTMLElement;
    expect(el.style.backgroundImage).toBe('url("blob:art")');
  });

  it('paints nothing when the fetch is refused', async () => {
    displayFetch.mockResolvedValue({ ok: false });
    const { container } = render(<DayArtLayer decor={art({ backgroundImage: '/api/backgrounds/serve?file=x.png' })} />);
    await act(async () => {});
    expect(container.querySelector('[data-day-art]')).toBeNull();
  });
});
