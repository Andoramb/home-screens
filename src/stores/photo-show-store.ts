import { create } from 'zustand';

/** A library picture or video a phone put over the wall's screen. */
export interface ShownPhoto {
  /** Serve URL; a video's carries the media token its <video> needs. */
  url: string;
  kind: 'image' | 'video';
  durationMs: number;
  /** A picture's size as people see it, when the hub could read it. */
  width?: number;
  height?: number;
}

interface PhotoShowState {
  photo: (ShownPhoto & { id: number }) | null;
  /** Show a photo, replacing any on screen, and take it down after its time. */
  show: (photo: ShownPhoto) => void;
  hide: () => void;
}

let counter = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * The one photo a phone put on the wall ("Show on the wall"), shown by
 * PhotoShowOverlay over whatever screen is up. A newer photo replaces it; a
 * tap, a finished video or its time running out takes it down.
 */
export const usePhotoShowStore = create<PhotoShowState>((set, get) => ({
  photo: null,
  show: (photo) => {
    clearTimeout(timer);
    const id = ++counter;
    set({ photo: { ...photo, id } });
    timer = setTimeout(() => {
      if (get().photo?.id === id) set({ photo: null });
    }, photo.durationMs);
  },
  hide: () => {
    clearTimeout(timer);
    set({ photo: null });
  },
}));
