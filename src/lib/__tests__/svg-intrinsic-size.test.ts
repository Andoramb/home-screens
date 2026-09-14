import { describe, expect, it } from 'vitest';
import { svgDeclaresSize } from '../svg-intrinsic-size';

describe('svgDeclaresSize', () => {
  it('accepts a viewBox on the root element', () => {
    expect(svgDeclaresSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect/></svg>')).toBe(true);
    expect(svgDeclaresSize("<?xml version='1.0'?>\n<svg viewBox='0 0 10 10'/>")).toBe(true);
  });

  it('accepts absolute width and height without a viewBox', () => {
    expect(svgDeclaresSize('<svg width="300" height="200"></svg>')).toBe(true);
    expect(svgDeclaresSize('<svg width="30mm" height="20mm"></svg>')).toBe(true);
  });

  it('rejects an svg with neither, percent lengths, or only one dimension', () => {
    expect(svgDeclaresSize('<svg/>')).toBe(false);
    expect(svgDeclaresSize('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')).toBe(false);
    expect(svgDeclaresSize('<svg width="100%" height="100%"></svg>')).toBe(false);
    expect(svgDeclaresSize('<svg width="300"></svg>')).toBe(false);
  });

  it('only reads the root element, not nested ones', () => {
    expect(svgDeclaresSize('<svg><svg viewBox="0 0 1 1"/></svg>')).toBe(false);
  });

  it('rejects text that is not an svg at all', () => {
    expect(svgDeclaresSize('')).toBe(false);
    expect(svgDeclaresSize('<html></html>')).toBe(false);
  });
});
