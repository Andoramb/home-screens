import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';
import { buildKioskConf } from '@/lib/kiosk';
import type { ScreenConfiguration } from '@/types/config';

/**
 * Which size and rotation kiosk.conf carries.
 *
 * Two writers produce the file and cannot share code at runtime: the app
 * rewrites it after every config save (TypeScript), and setup-system in
 * upgrade.sh regenerates it with an inline node program. Both once read only
 * the global settings, so on a config with a displays list, where the editor
 * saves the hub's rotation on the main display instead, the page was laid out
 * for a rotation the compositor never applied. This file holds the two to the
 * same answer.
 */

/**
 * The generator exactly as setup-system runs it: the whole
 * `DESIRED_KIOSK=$(node <<GENEOF ... )` assignment, through bash, so the
 * quoting bash does to the program on the way to node is under test too.
 */
const GENERATOR = (() => {
  const source = readFileSync(path.join(process.cwd(), 'scripts', 'upgrade.sh'), 'utf-8');
  const match = source.match(/DESIRED_KIOSK=\$\(node <<GENEOF\n[\s\S]*?\nGENEOF\n\s*\)\n/);
  if (!match) throw new Error('no kiosk.conf generator found in upgrade.sh');
  return `${match[0]}\nprintf '%s\\n' "\${DESIRED_KIOSK}"\n`;
})();

const dir = mkdtempSync(path.join(os.tmpdir(), 'kiosk-conf-'));

function runShellGenerator(config: unknown): string {
  const file = path.join(dir, 'config.json');
  writeFileSync(file, JSON.stringify(config));
  return execFileSync('bash', ['-c', GENERATOR], {
    encoding: 'utf8',
    env: { ...process.env, CONFIG_FILE: file },
  });
}

const globals = { displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal', piVariant: 'lite' };

const CASES: Array<{ name: string; config: Record<string, unknown>; want: string }> = [
  {
    name: 'no displays list: the globals',
    config: { settings: { ...globals, displayTransform: '90' } },
    want: 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="90"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'main display rotated while the globals say normal',
    config: {
      settings: globals,
      displays: [{ id: 'main', name: 'Main', displayWidth: 1080, displayHeight: 1920, displayTransform: '270' }],
    },
    want: 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="270"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'main display set back to normal while the globals are rotated',
    config: {
      settings: { ...globals, displayTransform: '90' },
      displays: [{ id: 'main', name: 'Main', displayTransform: 'normal' }],
    },
    want: 'DISPLAY_MODE="1920x1080"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'main is used even when another display is listed first',
    config: {
      settings: globals,
      displays: [
        { id: 'kitchen', name: 'Kitchen', displayWidth: 800, displayHeight: 480, displayTransform: '180' },
        { id: 'main', name: 'Main', displayTransform: '90' },
      ],
    },
    want: 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="90"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'no main: the first display, which is what /display renders',
    config: {
      settings: globals,
      displays: [{ id: 'kitchen', name: 'Kitchen', displayWidth: 480, displayHeight: 800, displayTransform: '90' }],
    },
    want: 'DISPLAY_MODE="800x480"\nDISPLAY_TRANSFORM="90"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'a display that sets nothing inherits the globals',
    config: { settings: { ...globals, displayTransform: '270' }, displays: [{ id: 'main', name: 'Main' }] },
    want: 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="270"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'rotation set in the display\'s settings overrides',
    config: { settings: globals, displays: [{ id: 'main', name: 'Main', settings: { displayTransform: '180' } }] },
    want: 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="180"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'size set in the display\'s settings overrides',
    config: { settings: globals, displays: [{ id: 'main', name: 'Main', settings: { displayWidth: 1280, displayHeight: 720 } }] },
    want: 'DISPLAY_MODE="1280x720"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'size on the display wins over size in its settings overrides',
    config: {
      settings: globals,
      displays: [{ id: 'main', name: 'Main', displayWidth: 800, displayHeight: 480, settings: { displayWidth: 1280, displayHeight: 720 } }],
    },
    want: 'DISPLAY_MODE="800x480"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'a rotation that is shell code on the display is never written',
    config: { settings: globals, displays: [{ id: 'main', name: 'Main', displayTransform: '$(touch pwned)' }] },
    want: 'DISPLAY_MODE="1920x1080"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'a rotation that is shell code in the globals is never written',
    config: { settings: { ...globals, displayTransform: '90"; touch pwned; "' } },
    want: 'DISPLAY_MODE="1920x1080"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'a size that is shell code is never written',
    config: { settings: { ...globals, displayWidth: '$(touch pwned)', displayHeight: 1080 } },
    want: 'PI_VARIANT="lite"\n',
  },
  {
    name: 'a touch matrix on the main display',
    config: { settings: globals, displays: [{ id: 'main', name: 'Main', displayTransform: '270', touchMatrix: [0, -1, 1, 1, 0, 0] }] },
    want: 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="270"\nTOUCH_MATRIX="0 -1 1 1 0 0"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'a touch matrix in the globals, with fractions and a negative zero',
    config: { settings: { ...globals, touchMatrix: [1.04, -0, -0.02, 0, 1.0300001, -0.015] } },
    want: 'DISPLAY_MODE="1920x1080"\nTOUCH_MATRIX="1.04 0 -0.02 0 1.03 -0.015"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'a main display that follows the rotation ignores a matrix left in the globals',
    config: { settings: { ...globals, touchMatrix: [-1, 0, 1, 0, 1, 0] }, displays: [{ id: 'main', name: 'Main' }] },
    want: 'DISPLAY_MODE="1920x1080"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'an empty displays list still reads the touch matrix from the globals',
    config: { settings: { ...globals, touchMatrix: [-1, 0, 1, 0, 1, 0] }, displays: [] },
    want: 'DISPLAY_MODE="1920x1080"\nTOUCH_MATRIX="-1 0 1 0 1 0"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'the main display\'s touch matrix wins over the globals',
    config: {
      settings: { ...globals, touchMatrix: [-1, 0, 1, 0, 1, 0] },
      displays: [{ id: 'main', name: 'Main', touchMatrix: [1, 0, 0, 0, 1, 0] }],
    },
    want: 'DISPLAY_MODE="1920x1080"\nTOUCH_MATRIX="1 0 0 0 1 0"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'a touch matrix that is shell code is never written',
    config: { settings: { ...globals, touchMatrix: ['$(touch pwned)', 0, 0, 0, 1, 0] } },
    want: 'DISPLAY_MODE="1920x1080"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'a touch matrix of the wrong length is never written',
    config: { settings: { ...globals, touchMatrix: [1, 0, 0, 0, 1] } },
    want: 'DISPLAY_MODE="1920x1080"\nPI_VARIANT="lite"\n',
  },
  {
    name: 'an empty displays list: the globals',
    config: { settings: { ...globals, displayTransform: '90' }, displays: [] },
    want: 'DISPLAY_MODE="1920x1080"\nDISPLAY_TRANSFORM="90"\nPI_VARIANT="lite"\n',
  },
];

describe('kiosk.conf generation', () => {
  for (const c of CASES) {
    it(`app writer: ${c.name}`, () => {
      expect(buildKioskConf(c.config as unknown as ScreenConfiguration)).toBe(c.want);
    });
    it(`setup-system writer: ${c.name}`, () => {
      expect(runShellGenerator(c.config)).toBe(c.want);
    });
  }
});
