import type { CSSProperties } from 'react';
import type { BackgroundShade } from '@/types/config';

/** Converts a hex color to an `r, g, b` triple usable inside an rgba() string. */
function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num) || full.length !== 6) return '0, 0, 0';
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

/**
 * Builds the CSS `background` value for a shade preset. Shared by the live
 * display (`ScreenRenderer`) and the editor canvas (`CanvasBackground`) so
 * what the user sees while editing matches the wall exactly.
 */
export function buildShadeBackground(shade: BackgroundShade): string {
  const rgb = hexToRgb(shade.color);
  const alpha = Math.max(0, Math.min(100, shade.strength)) / 100;

  const even = `rgba(${rgb}, ${alpha})`;
  const topBottom = [
    `linear-gradient(to bottom, rgba(${rgb}, ${alpha}) 0%, rgba(${rgb}, 0) 25%)`,
    `linear-gradient(to top, rgba(${rgb}, ${alpha}) 0%, rgba(${rgb}, 0) 25%)`,
  ];
  const edges = `radial-gradient(ellipse at center, rgba(${rgb}, 0) 55%, rgba(${rgb}, ${alpha}) 100%)`;

  switch (shade.style) {
    case 'even':
      return even;
    case 'topBottom':
      return topBottom.join(', ');
    case 'edges':
      return edges;
    case 'both':
      return [...topBottom, edges].join(', ');
    default:
      return even;
  }
}

/** Overlay drawn between a screen's background image and its modules. Renders nothing when disabled. */
export default function BackgroundShadeOverlay({ shade }: { shade: BackgroundShade | undefined }) {
  if (!shade?.enabled) return null;

  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: buildShadeBackground(shade),
    pointerEvents: 'none',
  };

  return <div data-testid="background-shade-overlay" style={style} />;
}
