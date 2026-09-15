import { describe, it, expect } from 'vitest';
import {
  displayShowsPaginationDots,
  paginationDotDefaultsInUse,
  showsPaginationDots,
} from '@/lib/pagination-dots';

describe('showsPaginationDots', () => {
  it('shows the dots unless they are switched off', () => {
    expect(showsPaginationDots({})).toBe(true);
    expect(showsPaginationDots({ showPaginationDots: true })).toBe(true);
    expect(showsPaginationDots({ showPaginationDots: false })).toBe(false);
  });
});

describe('displayShowsPaginationDots', () => {
  it('uses the shared default when the display has no override', () => {
    expect(displayShowsPaginationDots({ showPaginationDots: false }, undefined)).toBe(false);
    expect(displayShowsPaginationDots({ showPaginationDots: false }, { settings: {} })).toBe(false);
    expect(displayShowsPaginationDots({}, { settings: undefined })).toBe(true);
  });

  it('lets a display override win in both directions', () => {
    expect(displayShowsPaginationDots({ showPaginationDots: false }, { settings: { showPaginationDots: true } })).toBe(true);
    expect(displayShowsPaginationDots({}, { settings: { showPaginationDots: false } })).toBe(false);
  });
});

describe('paginationDotDefaultsInUse', () => {
  it('follows the shared default on a single-display install', () => {
    expect(paginationDotDefaultsInUse(true, undefined)).toBe(true);
    expect(paginationDotDefaultsInUse(false, undefined)).toBe(false);
  });

  it('stays in use while any display turns the dots back on', () => {
    const displays = [{ settings: {} }, { settings: { showPaginationDots: true } }];
    expect(paginationDotDefaultsInUse(false, displays)).toBe(true);
    expect(paginationDotDefaultsInUse(false, [{ settings: { showPaginationDots: false } }, {}])).toBe(false);
  });
});
