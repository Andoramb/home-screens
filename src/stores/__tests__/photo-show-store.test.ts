import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ShownPhoto } from '@/stores/photo-show-store';

// A fresh module per test resets the id counter and the pending timer too.
let usePhotoShowStore: typeof import('@/stores/photo-show-store').usePhotoShowStore;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  ({ usePhotoShowStore } = await import('@/stores/photo-show-store'));
});

afterEach(() => {
  vi.useRealTimers();
});

function store() {
  return usePhotoShowStore.getState();
}

const lake: ShownPhoto = { url: '/api/backgrounds/serve?file=lake.jpg', kind: 'image', durationMs: 10_000 };
const walk: ShownPhoto = { url: '/api/backgrounds/serve?file=walk.mp4&mt=tok', kind: 'video', durationMs: 20_000 };

describe('photo show store', () => {
  it('starts with nothing on screen', () => {
    expect(store().photo).toBeNull();
  });

  it('show puts the photo up with an id', () => {
    store().show(lake);
    expect(store().photo).toEqual({ ...lake, id: expect.any(Number) });
  });

  it('takes the photo down once its time is up', () => {
    store().show(lake);
    vi.advanceTimersByTime(lake.durationMs - 1);
    expect(store().photo?.url).toBe(lake.url);
    vi.advanceTimersByTime(1);
    expect(store().photo).toBeNull();
  });

  it('a second photo replaces the first, and the first one\'s time running out leaves it up', () => {
    store().show(lake);
    const firstId = store().photo!.id;
    vi.advanceTimersByTime(4_000);

    store().show(walk);
    expect(store().photo).toEqual({ ...walk, id: expect.any(Number) });
    expect(store().photo!.id).not.toBe(firstId);

    // Past the moment the first photo was due to come down.
    vi.advanceTimersByTime(lake.durationMs);
    expect(store().photo?.url).toBe(walk.url);

    // The second one keeps its own full time.
    vi.advanceTimersByTime(walk.durationMs - lake.durationMs - 1);
    expect(store().photo?.url).toBe(walk.url);
    vi.advanceTimersByTime(1);
    expect(store().photo).toBeNull();
  });

  it('hide takes the photo down at once', () => {
    store().show(lake);
    store().hide();
    expect(store().photo).toBeNull();
    // Nothing is left waiting to fire.
    expect(vi.getTimerCount()).toBe(0);
  });
});
