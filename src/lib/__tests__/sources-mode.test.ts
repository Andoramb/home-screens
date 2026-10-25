import { describe, it, expect } from 'vitest';
import { effectiveSourcesMode } from '../sources-mode';
import { isRotationActive, pickedBackground } from '../screen-background';

describe('sources mode', () => {
  it('derives the mode for configs without one', () => {
    expect(effectiveSourcesMode(undefined)).toBe('single');
    expect(effectiveSourcesMode({ sources: [] })).toBe('single');
    expect(effectiveSourcesMode({ sources: ['local'] })).toBe('multiple');
    expect(effectiveSourcesMode({ sources: ['local', 'immich'] })).toBe('multiple');
  });
  it('honors an explicit mode', () => {
    expect(effectiveSourcesMode({ sources: ['local', 'immich'], sourcesMode: 'single' })).toBe('single');
    expect(effectiveSourcesMode({ sources: [], sourcesMode: 'multiple' })).toBe('multiple');
  });
  it('Single never rotates but keeps the saved sources', () => {
    const rotation = { sources: ['local' as const], sourcesMode: 'single' as const, query: '', intervalMinutes: 60 };
    expect(isRotationActive(rotation)).toBe(false);
    expect(isRotationActive({ ...rotation, sourcesMode: 'multiple' })).toBe(true);
    // Picking a picture in Single leaves the rotation config alone.
    expect(pickedBackground({ backgroundRotation: rotation }, '/a.jpg')).toEqual({ backgroundImage: '/a.jpg' });
  });
});
