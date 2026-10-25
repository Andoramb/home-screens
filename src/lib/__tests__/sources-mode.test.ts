import { describe, it, expect } from 'vitest';
import { effectiveSourcesMode, sourcesForMode } from '../sources-mode';

describe('sources mode', () => {
  it('derives the mode for configs without one', () => {
    expect(effectiveSourcesMode(undefined)).toBe('single');
    expect(effectiveSourcesMode({ sources: ['local'] })).toBe('single');
    expect(effectiveSourcesMode({ sources: ['local', 'immich'] })).toBe('multiple');
  });
  it('honors an explicit mode', () => {
    expect(effectiveSourcesMode({ sources: ['local', 'immich'], sourcesMode: 'single' })).toBe('single');
    expect(effectiveSourcesMode({ sources: [], sourcesMode: 'multiple' })).toBe('multiple');
  });
  it('keeps the first source when going Single, all when going Multiple', () => {
    expect(sourcesForMode(['immich', 'local'], 'single')).toEqual(['immich']);
    expect(sourcesForMode([], 'single')).toEqual([]);
    expect(sourcesForMode(['immich', 'local'], 'multiple')).toEqual(['immich', 'local']);
  });
});
