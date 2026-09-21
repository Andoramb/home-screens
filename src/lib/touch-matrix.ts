import { isValidTouchMatrix, TOUCH_MATRIX_LENGTH } from '@/lib/display-filter';

/**
 * Rules for the touch alignment setting, shared by the Screen page and the
 * per-display page.
 *
 * The saved value is `touchMatrix`: unset means touch follows the screen
 * rotation (scripts/labwc-rc.sh holds that table), the matrix that changes
 * nothing means touch is left as the panel reports it, and any other six
 * numbers are the owner's own.
 */

/** The matrix that changes nothing. */
export const TOUCH_MATRIX_IDENTITY: readonly number[] = [1, 0, 0, 0, 1, 0];

export type TouchAlignmentMode = 'follow' | 'leave' | 'custom';

export function touchAlignmentMode(matrix: readonly number[] | null | undefined): TouchAlignmentMode {
  if (matrix == null || !isValidTouchMatrix(matrix)) return 'follow';
  return matrix.every((n, i) => n === TOUCH_MATRIX_IDENTITY[i]) ? 'leave' : 'custom';
}

export function formatTouchMatrix(matrix: readonly number[] | null | undefined): string {
  return matrix == null ? '' : matrix.join(' ');
}

/**
 * Six numbers typed with spaces or commas between them, or null when the text
 * is anything else.
 */
export function parseTouchMatrix(text: string): number[] | null {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length !== TOUCH_MATRIX_LENGTH || !parts.every((p) => /^-?(\d+\.?\d*|\.\d+)$/.test(p))) return null;
  const matrix = parts.map(Number);
  return isValidTouchMatrix(matrix) ? matrix : null;
}
