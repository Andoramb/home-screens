/**
 * Kiosk display management — syncs display settings to kiosk.conf
 * (read by kiosk-launcher.sh on boot) and applies wlr-randr live.
 */
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import path from 'path';
import { DISPLAY_TRANSFORMS, findMainDisplay } from '@/lib/display-filter';
import type { ScreenConfiguration } from '@/types/config';

const KIOSK_CONF = 'data/kiosk.conf';

function getKioskConfPath(): string {
  return path.join(process.cwd(), KIOSK_CONF);
}

export interface HubPanel {
  width: number;
  height: number;
  transform: (typeof DISPLAY_TRANSFORMS)[number];
}

/**
 * The size and rotation of the screen plugged into this machine.
 *
 * Once a displays registry exists, the hub's own screen is the display that
 * `/display` renders (`findMainDisplay`), and the editor edits its size and
 * rotation on that node; the global values are hidden there and go stale.
 * Reading the globals regardless left the page laid out for a rotation the
 * compositor never applied. Each field falls back on its own, in the order
 * `filterConfigForDisplay` merges them: the node, the node's `settings`, the
 * globals. Without a registry the globals are the only source.
 *
 * kiosk.conf is sourced by bash, so a value outside the four real rotations
 * never leaves here: it reads as `normal`, which is also how the page treats
 * it. Saves refuse such a value too, but config.json can be edited by hand.
 *
 * The generator inside upgrade.sh's setup-system is a literal copy of this
 * rule (it runs with no lib beside it); scripts/__tests__/kiosk-conf.test.ts
 * keeps the two in step.
 */
export function resolveHubPanel(config: ScreenConfiguration): HubPanel {
  const s = config.settings;
  const hub = findMainDisplay(config.displays);
  const transform = hub?.displayTransform ?? hub?.settings?.displayTransform ?? s.displayTransform;
  return {
    width: hub?.displayWidth ?? hub?.settings?.displayWidth ?? s.displayWidth ?? 0,
    height: hub?.displayHeight ?? hub?.settings?.displayHeight ?? s.displayHeight ?? 0,
    transform: DISPLAY_TRANSFORMS.find((t) => t === transform) ?? 'normal',
  };
}

/**
 * Generate kiosk.conf content from config settings.
 * The file is pure shell key=value pairs, readable without node.
 */
export function buildKioskConf(config: ScreenConfiguration): string {
  const raw = config as unknown as Record<string, unknown>;
  const rawSettings = (raw.settings ?? {}) as Record<string, unknown>;

  const panel = resolveHubPanel(config);
  const mw = Math.max(panel.width, panel.height);
  const mh = Math.min(panel.width, panel.height);

  const lines: string[] = [];
  if (mw && mh) lines.push(`DISPLAY_MODE="${mw}x${mh}"`);
  if (panel.transform !== 'normal') {
    lines.push(`DISPLAY_TRANSFORM="${panel.transform}"`);
  }
  // piVariant is set by install scripts but not in the TypeScript types.
  // Validate to prevent shell injection since kiosk.conf is sourced by bash.
  const piVariant = rawSettings.piVariant as string | undefined;
  if (piVariant && /^[a-z0-9-]+$/.test(piVariant)) lines.push(`PI_VARIANT="${piVariant}"`);

  return lines.join('\n') + '\n';
}

/**
 * Write kiosk.conf so kiosk-launcher.sh picks up display settings on next boot.
 * Called after every config write to keep kiosk.conf in sync.
 */
export async function syncKioskConf(config: ScreenConfiguration): Promise<void> {
  const confPath = getKioskConfPath();
  const desired = buildKioskConf(config);
  // Only write if content changed (avoids unnecessary disk writes on Pi SD cards)
  try {
    const current = await fs.readFile(confPath, 'utf-8');
    if (current === desired) return;
  } catch {
    // File doesn't exist yet — write it
  }
  await fs.writeFile(confPath, desired, 'utf-8');
}

/** Fallback when nothing can be detected: the port a Pi almost always uses. */
const FALLBACK_OUTPUT = 'HDMI-A-1';

/**
 * The output name to drive, read out of `wlr-randr`'s report.
 *
 * Each output is a block: an unindented name line, then indented properties,
 * one of which is `Enabled: yes` or `Enabled: no`. Disabled connectors are
 * listed too, so taking the first line put the rotation on a dark screen
 * whenever a second port was connected but switched off. The same parse lives
 * in both kiosk launchers as literal copies (they ship with no lib beside
 * them); scripts/__tests__/output-detection.test.ts keeps the three in step.
 *
 * Still first-past-the-post when several outputs are live: choosing between
 * two working screens is a setting we do not have yet, not a guess to make
 * here.
 */
export function parseWlrRandrOutput(stdout: string): string {
  let first = '';
  let current = '';
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) {
      current = line.trim().split(/\s+/)[0] ?? '';
      if (!first) first = current;
    } else if (/^\s+Enabled:\s*yes\b/.test(line) && current) {
      return current;
    }
  }
  return first || FALLBACK_OUTPUT;
}

/**
 * Detect the Wayland output name via wlr-randr.
 */
function detectOutput(): Promise<string> {
  return new Promise((resolve) => {
    execFile('wlr-randr', [], {
      env: { ...process.env, XDG_RUNTIME_DIR: `/run/user/${process.getuid?.() ?? 1000}`, WAYLAND_DISPLAY: 'wayland-0' },
      timeout: 5000,
    }, (err, stdout) => {
      if (err || !stdout) return resolve(FALLBACK_OUTPUT);
      resolve(parseWlrRandrOutput(stdout));
    });
  });
}

/**
 * Run a single wlr-randr command with Wayland env vars.
 * Resolves true on success, false on failure.
 */
function wlrRandr(...args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('wlr-randr', args, {
      env: { ...process.env, XDG_RUNTIME_DIR: `/run/user/${process.getuid?.() ?? 1000}`, WAYLAND_DISPLAY: 'wayland-0' },
      timeout: 5000,
    }, (err) => resolve(!err));
  });
}

// Serialize concurrent apply calls so interleaved wlr-randr commands
// don't leave the display in an inconsistent state.
let applyQueue: Promise<boolean> = Promise.resolve(false);

/**
 * Apply display transform and mode via wlr-randr immediately (no reboot).
 * Transform and mode are applied as separate calls so a mode failure
 * (e.g. resolution not in EDID) doesn't prevent the transform from applying.
 *
 * Returns true if the transform was applied successfully.
 */
export function applyDisplaySettings(config: ScreenConfiguration): Promise<boolean> {
  const next = applyQueue.catch(() => false).then(() => doApplyDisplaySettings(config));
  applyQueue = next;
  return next;
}

async function doApplyDisplaySettings(config: ScreenConfiguration): Promise<boolean> {
  const { width: w, height: h, transform } = resolveHubPanel(config);

  // Detect the connected output name
  const output = await detectOutput();
  let applied = false;

  // Apply transform (rotation) — independent of mode
  applied = await wlrRandr('--output', output, '--transform', transform);

  // Apply mode (best-effort: try EDID mode, then custom-mode, then skip)
  if (w && h) {
    const mw = Math.max(w, h);
    const mh = Math.min(w, h);
    const mode = `${mw}x${mh}`;
    const modeOk = await wlrRandr('--output', output, '--mode', mode);
    if (!modeOk) {
      await wlrRandr('--output', output, '--custom-mode', mode);
    }
  }

  return applied;
}
