// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import CrossfadeBackground, { CROSSFADE_MS } from '../CrossfadeBackground';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CrossfadeBackground', () => {
  it('renders a single image layer for the initial src', () => {
    const { container } = render(<CrossfadeBackground src="/a.jpg" />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toContain('/a.jpg');
  });

  it('keeps the previous image mounted underneath while the new one loads, then drops it after the fade', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CrossfadeBackground src="/a.jpg" />);
    rerender(<CrossfadeBackground src="/b.jpg" />);

    // Both layers present: the old one still visible, the new one fading in.
    let imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs.map((img) => img.src.split('/').pop())).toEqual(['a.jpg', 'b.jpg']);

    // The new layer finishes loading and starts its fade.
    act(() => { fireEvent.load(imgs[1]); });

    // After the fade completes, only the new layer remains.
    act(() => { vi.advanceTimersByTime(CROSSFADE_MS); });
    imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs.map((img) => img.src.split('/').pop())).toEqual(['b.jpg']);
  });

  it('calls onError with the failing layer src', () => {
    const onError = vi.fn();
    const { container } = render(<CrossfadeBackground src="/missing.jpg" onError={onError} />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('/missing.jpg'));
  });

  it('renders a video element for a video-extension src', () => {
    const { container } = render(<CrossfadeBackground src="/clip.mp4" />);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.autoplay).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.muted).toBe(true);
  });

  it('renders nothing for an empty src', () => {
    const { container } = render(<CrossfadeBackground src={undefined} />);
    expect(container.querySelectorAll('img, video')).toHaveLength(0);
  });
});
