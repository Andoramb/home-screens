import type { Screen, ScreenConfiguration } from '@/types/config';

/**
 * The config with every module of a plugin taken off every screen: the
 * single-display screens and each display's own. `moduleType` is the
 * manifest's raw type, without the `plugin:` prefix.
 *
 * Uninstalling a plugin runs this on the hub and, for an editor holding
 * unsaved edits, on the editor's copy, so the modules come off the walls
 * with the plugin instead of staying behind as a "Plugin not available" box.
 * Nothing else in a config names a module by id (profiles list screens,
 * rules show screens), so there is nothing to tidy up after them.
 *
 * Returns `config` itself when no screen held one, so `updateConfigAtomic`
 * skips the write.
 */
export function removePluginModules(config: ScreenConfiguration, moduleType: string): ScreenConfiguration {
  const type = `plugin:${moduleType}`;
  let changed = false;
  const strip = (screens: Screen[]): Screen[] => {
    if (!screens.some((s) => s.modules.some((m) => m.type === type))) return screens;
    changed = true;
    return screens.map((s) => (s.modules.some((m) => m.type === type)
      ? { ...s, modules: s.modules.filter((m) => m.type !== type) }
      : s));
  };

  const screens = strip(config.screens);
  const displays = config.displays?.map((d) => {
    const next = strip(d.screens);
    return next === d.screens ? d : { ...d, screens: next };
  });
  if (!changed) return config;
  return { ...config, screens, ...(displays ? { displays } : {}) };
}
