import { describe, it, expect, vi } from 'vitest';
import type { MediaRotationControls } from '@/hooks/useRotatingIndex';
import { handleSlideshowCommand } from '../slideshow-commands';

function controls() {
  return {
    next: vi.fn(),
    back: vi.fn(),
    paused: false,
    setPaused: vi.fn(),
  } satisfies MediaRotationControls;
}

describe('handleSlideshowCommand', () => {
  it('next steps forward', () => {
    const c = controls();
    handleSlideshowCommand(c, 'next');
    expect(c.next).toHaveBeenCalledTimes(1);
    expect(c.back).not.toHaveBeenCalled();
    expect(c.setPaused).not.toHaveBeenCalled();
  });

  it('prev steps back', () => {
    const c = controls();
    handleSlideshowCommand(c, 'prev');
    expect(c.back).toHaveBeenCalledTimes(1);
    expect(c.next).not.toHaveBeenCalled();
    expect(c.setPaused).not.toHaveBeenCalled();
  });

  it('pause holds the slideshow and play lets it go again', () => {
    const c = controls();
    handleSlideshowCommand(c, 'pause');
    expect(c.setPaused).toHaveBeenLastCalledWith(true);
    handleSlideshowCommand(c, 'play');
    expect(c.setPaused).toHaveBeenLastCalledWith(false);
    expect(c.setPaused).toHaveBeenCalledTimes(2);
    expect(c.next).not.toHaveBeenCalled();
    expect(c.back).not.toHaveBeenCalled();
  });

  it('ignores any other action', () => {
    const c = controls();
    for (const action of ['goto', 'refresh', 'NEXT', 'Pause', 'next ', '']) {
      handleSlideshowCommand(c, action);
    }
    expect(c.next).not.toHaveBeenCalled();
    expect(c.back).not.toHaveBeenCalled();
    expect(c.setPaused).not.toHaveBeenCalled();
  });
});
