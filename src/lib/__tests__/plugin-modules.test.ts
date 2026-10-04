import { describe, it, expect } from 'vitest';
import { removePluginModules } from '@/lib/plugin-modules';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';

function mod(id: string, type: string): ModuleInstance {
  return {
    id,
    type: type as ModuleInstance['type'],
    position: { x: 0, y: 0 },
    size: { w: 200, h: 200 },
    zIndex: 1,
    config: {},
    style: { ...DEFAULT_MODULE_STYLE },
  };
}

function screen(id: string, modules: ModuleInstance[]): Screen {
  return { id, name: id, backgroundImage: '', modules };
}

function config(overrides: Partial<ScreenConfiguration> = {}): ScreenConfiguration {
  return {
    version: 1,
    settings: {} as ScreenConfiguration['settings'],
    screens: [],
    ...overrides,
  };
}

describe('removePluginModules', () => {
  it('takes the plugin off the single-display screens', () => {
    const before = config({
      screens: [screen('s1', [mod('flag', 'plugin:flag'), mod('clock', 'clock')])],
    });
    const after = removePluginModules(before, 'flag');
    expect(after.screens[0].modules.map((m) => m.id)).toEqual(['clock']);
  });

  it('takes the plugin off every display, leaving other plugins and screens alone', () => {
    const quiet = screen('q', [mod('clock', 'clock')]);
    const before = config({
      displays: [
        { id: 'main', name: 'Main', screens: [screen('m1', [mod('a', 'plugin:flag'), mod('b', 'plugin:flagpole')]), quiet] },
        { id: 'porch', name: 'Porch', screens: [screen('p1', [mod('c', 'plugin:flag')])] },
      ],
    });
    const after = removePluginModules(before, 'flag');
    expect(after.displays![0].screens[0].modules.map((m) => m.id)).toEqual(['b']);
    expect(after.displays![0].screens[1]).toBe(quiet);
    // The screen it emptied stays, so profiles and rules that name it still hold.
    expect(after.displays![1].screens).toEqual([screen('p1', [])]);
  });

  it('hands back the same config when no screen shows the plugin', () => {
    const before = config({
      screens: [screen('s1', [mod('clock', 'clock')])],
      displays: [{ id: 'main', name: 'Main', screens: [screen('m1', [mod('other', 'plugin:other')])] }],
    });
    expect(removePluginModules(before, 'flag')).toBe(before);
  });
});
