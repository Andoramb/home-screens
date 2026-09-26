import type { MediaRotationControls } from '@/hooks/useRotatingIndex';

/** The `module-command` actions both photo modules answer, from the phone's Control tab. */
export const SLIDESHOW_ACTIONS = ['next', 'prev', 'pause', 'play'] as const;
export type SlideshowAction = (typeof SLIDESHOW_ACTIONS)[number];

/** Apply one remote action to a slideshow's rotation; anything else is ignored. */
export function handleSlideshowCommand(controls: MediaRotationControls, action: string): void {
  if (action === 'next') controls.next();
  else if (action === 'prev') controls.back();
  else if (action === 'pause') controls.setPaused(true);
  else if (action === 'play') controls.setPaused(false);
}
