import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Makes a saved layout safe to draw when someone edited the file by hand and
 * left a module half-written.
 *
 * Every save through the app is validated, so this only ever matters for a
 * file changed outside it. There, one module with `"config": null` or no
 * `position` used to take the whole wall and the whole editor down, from any
 * screen: the code that places a module and gathers its data reads those
 * fields before the module's own error boundary is in play. An entry that
 * is not a module at all (not an object, or with no type) is left out; one
 * that only lacks a piece gets a plain stand-in for it. A stand-in id comes
 * from where the module sits, so every read of the same file gives the same
 * config.
 *
 * Returns the config it was given when there is nothing to repair, so callers
 * that compare by reference (caches, no-op writes) see no change.
 */
export function repairConfigShape(config: ScreenConfiguration): ScreenConfiguration {
  if (!isRecord(config)) return config;
  const screens = repairScreens(config.screens);
  let displaysChanged = false;
  const displays = Array.isArray(config.displays)
    ? config.displays.map((display) => {
        if (!isRecord(display)) return display;
        const repaired = repairScreens(display.screens);
        if (repaired === display.screens) return display;
        displaysChanged = true;
        return { ...display, screens: repaired };
      })
    : config.displays;
  if (screens === config.screens && !displaysChanged) return config;
  return { ...config, screens, ...(displaysChanged ? { displays } : {}) };
}

function repairScreens(screens: Screen[]): Screen[] {
  if (!Array.isArray(screens)) return screens;
  let changed = false;
  const next = screens.map((screen, index) => {
    if (!isRecord(screen) || !Array.isArray(screen.modules)) return screen;
    const modules = repairModules(screen.modules, typeof screen.id === 'string' && screen.id ? screen.id : String(index));
    if (modules === screen.modules) return screen;
    changed = true;
    return { ...screen, modules };
  });
  return changed ? next : screens;
}

const isPoint = (value: unknown, a: string, b: string): boolean =>
  isRecord(value) && Number.isFinite(value[a]) && Number.isFinite(value[b]);

function repairModules(modules: ModuleInstance[], screenKey: string): ModuleInstance[] {
  let changed = false;
  const next: ModuleInstance[] = [];
  for (const [index, mod] of modules.entries()) {
    if (!isRecord(mod) || typeof mod.type !== 'string' || !mod.type) {
      changed = true;
      continue;
    }
    const hasId = typeof mod.id === 'string' && mod.id !== '';
    const sound = hasId
      && isRecord(mod.config)
      && isPoint(mod.position, 'x', 'y')
      && isPoint(mod.size, 'w', 'h')
      && Number.isFinite(mod.zIndex)
      && isRecord(mod.style);
    if (sound) {
      next.push(mod);
      continue;
    }
    changed = true;
    next.push({
      ...mod,
      id: hasId ? mod.id : `module-${screenKey}-${index}`,
      config: isRecord(mod.config) ? mod.config : {},
      position: isPoint(mod.position, 'x', 'y') ? mod.position : { x: 0, y: 0 },
      size: isPoint(mod.size, 'w', 'h') ? mod.size : { w: 400, h: 300 },
      zIndex: Number.isFinite(mod.zIndex) ? mod.zIndex : 1,
      style: isRecord(mod.style) ? mod.style : { ...DEFAULT_MODULE_STYLE },
    });
  }
  return changed ? next : modules;
}
