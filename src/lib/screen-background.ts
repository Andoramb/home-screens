import type { Screen } from '@/types/config';
import { displaySizedUrl, type PictureBox } from '@/lib/media-paths';

/**
 * What background rotation has answered for one screen: the photo it is
 * showing, `null` when it has none (the screen's own picture stands), or
 * `undefined` while no answer has come back yet.
 */
export type RotationAnswer = string | null | undefined;

/**
 * Whether rotation is effectively on for a screen: at least one source is
 * checked. `sources.length > 0` is authoritative — the legacy `enabled` flag
 * is no longer read here. Migration v14→v15 already folds every saved
 * screen's rotation source(s) into `sources`, so a config with rotation
 * configured always has a populated `sources` array by the time this runs;
 * `enabled` surviving on the type is only for configs an older editor build
 * still writes it onto.
 */
export function isRotationActive(rotation: Screen['backgroundRotation'] | undefined): boolean {
  return (rotation?.sources?.length ?? 0) > 0;
}

/**
 * The picture a screen paints behind its modules, on the wall and in the
 * editor alike. With rotation on, the screen's own picture is only what the
 * rotation falls back to, so nothing paints until the first answer is in:
 * painting the own picture meant every load showed it and then swapped the
 * photo in over it.
 */
export function resolveScreenBackground(
  screen: Pick<Screen, 'backgroundImage' | 'backgroundRotation'>,
  rotation: RotationAnswer,
): string | undefined {
  if (!isRotationActive(screen.backgroundRotation)) return screen.backgroundImage || undefined;
  if (rotation === undefined) return undefined;
  return rotation || screen.backgroundImage || undefined;
}

/**
 * The URL the wall fetches for a screen's picture: a library picture is asked
 * for at the canvas size rather than as the camera original. The rotator's
 * preload and the renderer must agree on it, or the preload warms a picture
 * the screen never asks for.
 */
export function screenBackgroundSrc(
  screen: Pick<Screen, 'backgroundImage' | 'backgroundRotation'>,
  rotation: RotationAnswer,
  canvas: PictureBox,
): string | undefined {
  return displaySizedUrl(resolveScreenBackground(screen, rotation), canvas);
}
