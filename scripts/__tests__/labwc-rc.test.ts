import { describe, it, expect } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * What scripts/labwc-rc.sh writes to labwc's rc.xml.
 *
 * The script owns the whole file, so an update used to erase a touch
 * calibration matrix added by hand, and a rotated touchscreen went back to
 * answering taps in the wrong place. The matrix now comes from kiosk.conf:
 * from the rotation, or from six numbers that replace it.
 */

const BASE = `<?xml version="1.0"?>
<!-- Written by Home Screens (scripts/labwc-rc.sh) and replaced on every update. Touch alignment is set in Settings, not here. -->
<labwc_config>
  <windowRules>
    <windowRule identifier="*" serverDecoration="no" skipTaskbar="yes" skipWindowSwitcher="yes" />
  </windowRules>
  <keyboard>
    <keybind key="W-h">
      <action name="HideCursor"/>
    </keybind>
  </keyboard>`;

const withMatrix = (m: string) => `${BASE}
  <libinput>
    <device category="touch">
      <calibrationMatrix>${m}</calibrationMatrix>
    </device>
  </libinput>
</labwc_config>\n`;
// The matrix that changes nothing is written out rather than left off: labwc
// before 0.9.8 never clears a matrix on reload, so a screen set back to
// unrotated kept its touch turned until the next reboot.
const plain = withMatrix('1 0 0 0 1 0');

/** A throwaway app dir plus home, with the script copied in as it ships. */
function sandbox(kioskConf: string | null, existingRc?: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'labwc-rc-'));
  const app = path.join(root, 'app');
  const home = path.join(root, 'home');
  mkdirSync(path.join(app, 'scripts'), { recursive: true });
  mkdirSync(path.join(app, 'data'), { recursive: true });
  mkdirSync(home, { recursive: true });
  cpSync(path.join(process.cwd(), 'scripts', 'labwc-rc.sh'), path.join(app, 'scripts', 'labwc-rc.sh'));
  if (kioskConf != null) writeFileSync(path.join(app, 'data', 'kiosk.conf'), kioskConf);
  const rc = path.join(home, '.config', 'labwc', 'rc.xml');
  if (existingRc != null) {
    mkdirSync(path.dirname(rc), { recursive: true });
    writeFileSync(rc, existingRc);
  }
  const run = (...args: string[]) =>
    execFileSync('bash', [path.join(app, 'scripts', 'labwc-rc.sh'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    });
  return { rc, run };
}

const CASES: Array<{ name: string; conf: string | null; want: string }> = [
  { name: 'no kiosk.conf', conf: null, want: plain },
  { name: 'an unrotated screen', conf: 'DISPLAY_MODE="1920x1080"\n', want: plain },
  { name: 'rotated 90', conf: 'DISPLAY_TRANSFORM="90"\n', want: withMatrix('0 -1 1 1 0 0') },
  { name: 'rotated 180', conf: 'DISPLAY_TRANSFORM="180"\n', want: withMatrix('-1 0 1 0 -1 1') },
  // The matrix issue #62's reporter found by hand for their 270 screen.
  { name: 'rotated 270', conf: 'DISPLAY_TRANSFORM="270"\n', want: withMatrix('0 1 0 -1 0 1') },
  {
    name: 'six numbers replace the rotation matrix',
    conf: 'DISPLAY_TRANSFORM="270"\nTOUCH_MATRIX="1.04 0 -0.02 0 1.03 -0.015"\n',
    want: withMatrix('1.04 0 -0.02 0 1.03 -0.015'),
  },
  {
    name: 'six numbers that leave touch alone on a rotated screen',
    conf: 'DISPLAY_TRANSFORM="270"\nTOUCH_MATRIX="1 0 0 0 1 0"\n',
    want: plain,
  },
  {
    name: 'a matrix that is not six numbers falls back to the rotation',
    conf: 'DISPLAY_TRANSFORM="90"\nTOUCH_MATRIX="1 0 0 </calibrationMatrix>"\n',
    want: withMatrix('0 -1 1 1 0 0'),
  },
];

describe('labwc rc.xml', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const { rc, run } = sandbox(c.conf);
      expect(run('--create')).toBe('changed\n');
      expect(readFileSync(rc, 'utf-8')).toBe(c.want);
    });
  }

  it('replaces a file it wrote before, and reports nothing the second time', () => {
    const { rc, run } = sandbox('DISPLAY_TRANSFORM="270"\n', plain);
    expect(run()).toBe('changed\n');
    expect(readFileSync(rc, 'utf-8')).toBe(withMatrix('0 1 0 -1 0 1'));
    expect(run()).toBe('');
  });

  it('goes back to the matrix that changes nothing when the rotation is removed', () => {
    const { rc, run } = sandbox('DISPLAY_MODE="1920x1080"\n', withMatrix('0 1 0 -1 0 1'));
    expect(run()).toBe('changed\n');
    expect(readFileSync(rc, 'utf-8')).toBe(plain);
  });

  // The app runs this after a save, and the app also runs on desktops whose
  // labwc config is the owner's own: keybinds, themes, window rules.
  it('leaves an rc.xml it did not write alone unless told to create it', () => {
    const theirs = '<labwc_config><theme><name>Mine</name></theme></labwc_config>\n';
    const { rc, run } = sandbox('DISPLAY_TRANSFORM="270"\n', theirs);
    expect(run()).toBe('');
    expect(readFileSync(rc, 'utf-8')).toBe(theirs);
    expect(run('--create')).toBe('changed\n');
    expect(readFileSync(rc, 'utf-8')).toBe(withMatrix('0 1 0 -1 0 1'));
  });

  it('leaves a machine with no rc.xml alone unless told to create it', () => {
    const { rc, run } = sandbox('DISPLAY_TRANSFORM="270"\n');
    expect(run()).toBe('');
    expect(existsSync(rc)).toBe(false);
  });
});
