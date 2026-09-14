/**
 * Whether an SVG document tells the browser its shape. CSS sizes an SVG
 * background or <img> from its intrinsic ratio: with a viewBox, or with
 * absolute width and height, the browser can scale it proportionally; with
 * neither, `background-size: auto 40%` resolves the auto axis to 100% of the
 * box and the picture stretches instead of shrinking. The media library
 * refuses such files at upload so a picture never looks right at one size
 * and wrong at another.
 *
 * Only the root <svg> element's attributes count (nested elements can carry
 * their own). Percent lengths are not absolute.
 */
export function svgDeclaresSize(source: string): boolean {
  const root = /<svg\b([^>]*)>/i.exec(source);
  if (!root) return false;
  const attrs = root[1];
  if (/\sviewBox\s*=\s*["'][^"']+["']/i.test(attrs)) return true;
  const width = /\swidth\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.trim();
  const height = /\sheight\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.trim();
  const absolute = (v: string | undefined) => !!v && /^\d*\.?\d+(px|pt|pc|cm|mm|in|em|rem)?$/i.test(v);
  return absolute(width) && absolute(height);
}
