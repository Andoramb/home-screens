import { describe, it, expect } from 'vitest';
import { displayFormProblem } from '@/components/editor/settings/DisplaysIndexPage';
import { MAX_DISPLAY_DIMENSION, MIN_DISPLAY_DIMENSION, validateDisplays } from '@/lib/display-filter';
import type { ScreenConfiguration } from '@/types/config';

/**
 * What the Add display form refuses, and which field it points at.
 *
 * The resolution pair is the easiest thing on this form to get wrong (four
 * digits, typed twice) and the most expensive: a canvas built from 192 x 108
 * instead of 1920 x 1080 is about 85 x 50 screen pixels, too small to drop a
 * module into, and any layout work done on it is wasted. Every other field
 * already refuses bad input; this pins that resolution does too, on both
 * sides of the save.
 */

function form(overrides: Partial<Parameters<typeof displayFormProblem>[0]> = {}) {
  return displayFormProblem({
    name: 'Kitchen',
    id: 'kitchen',
    width: 1920,
    height: 1080,
    isEdit: false,
    takenIds: new Set<string>(),
    ...overrides,
  });
}

function configWith(width: number, height: number): ScreenConfiguration {
  return {
    version: 1,
    screens: [],
    settings: {},
    displays: [{ id: 'kitchen', name: 'Kitchen', screens: [], displayWidth: width, displayHeight: height }],
  } as unknown as ScreenConfiguration;
}

describe('the Add display form', () => {
  it('accepts a normal screen', () => {
    expect(form()).toBeNull();
  });

  it('accepts the smallest panels people actually hang on a wall', () => {
    // The official Raspberry Pi touch display, and a 3.5 inch panel.
    expect(form({ width: 800, height: 480 })).toBeNull();
    expect(form({ width: 480, height: 320 })).toBeNull();
  });

  it('refuses a resolution with a dropped digit and points at the field', () => {
    expect(form({ width: 192, height: 108 })).toMatchObject({
      field: 'width',
      messageKey: 'settings.displaysIndex.formErrorWidth',
    });
    expect(form({ width: 1920, height: 108 })).toMatchObject({
      field: 'height',
      messageKey: 'settings.displaysIndex.formErrorHeight',
    });
  });

  it('refuses a resolution that could not show anything at all', () => {
    expect(form({ width: 7, height: 9 })?.field).toBe('width');
    expect(form({ width: 0, height: 1080 })?.field).toBe('width');
    expect(form({ width: 1920, height: -1 })?.field).toBe('height');
    expect(form({ width: 1920.5, height: 1080 })?.field).toBe('width');
  });

  it('refuses a resolution past the cap', () => {
    expect(form({ width: MAX_DISPLAY_DIMENSION + 1 })?.field).toBe('width');
    expect(form({ height: MAX_DISPLAY_DIMENSION + 1 })?.field).toBe('height');
  });

  it('still refuses an empty name and a taken id, each at its own field', () => {
    expect(form({ name: '   ' })).toMatchObject({ field: 'name' });
    expect(form({ id: 'all' })).toMatchObject({ field: 'id' });
    expect(form({ id: 'Kitchen TV' })).toMatchObject({ field: 'id' });
    expect(form({ takenIds: new Set(['kitchen']) })).toMatchObject({ field: 'id' });
    // Editing an existing display keeps its own id.
    expect(form({ isEdit: true, takenIds: new Set(['kitchen']) })).toBeNull();
  });
});

describe('the saved config', () => {
  it('refuses the same resolutions the form does', () => {
    expect(validateDisplays(configWith(1920, 1080))).toBeNull();
    expect(validateDisplays(configWith(MIN_DISPLAY_DIMENSION, MIN_DISPLAY_DIMENSION))).toBeNull();
    expect(validateDisplays(configWith(192, 108))).toMatch(/displayWidth/);
    expect(validateDisplays(configWith(1920, 108))).toMatch(/displayHeight/);
    expect(validateDisplays(configWith(7, 9))).toMatch(/displayWidth/);
  });
});
