import { describe, it, expect } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
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

const HEAD = `<?xml version="1.0"?>
<!-- Written by Home Screens (scripts/labwc-rc.sh) and replaced on every update. Touch alignment is set in Settings, not here. -->
<labwc_config>
`;
// What a labwc from 0.8.3 on gets when kanshi is installed: new screens stay
// off until kanshi switches them on, so a monitor that reconnects while the
// power agent holds it off does not light up.
const CORE = `  <core>
    <autoEnableOutputs>no</autoEnableOutputs>
  </core>
`;
const BODY = `  <windowRules>
    <windowRule identifier="*" serverDecoration="no" skipTaskbar="yes" skipWindowSwitcher="yes" />
  </windowRules>
  <keyboard>
    <keybind key="W-h">
      <action name="HideCursor"/>
    </keybind>
  </keyboard>`;

const withMatrix = (m: string, core = '') => `${HEAD}${core}${BODY}
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

/** The programs on PATH beside the script: labwc answering --version with this line, and kanshi. */
interface Tools {
  labwc?: string;
  kanshi?: boolean;
}

/** A throwaway app dir plus home, with the script copied in as it ships. */
function sandbox(kioskConf: string | null, existingRc?: string, tools: Tools = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'labwc-rc-'));
  const app = path.join(root, 'app');
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  mkdirSync(path.join(app, 'scripts'), { recursive: true });
  mkdirSync(path.join(app, 'data'), { recursive: true });
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const stub = (name: string, body: string) => {
    writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(path.join(bin, name), 0o755);
  };
  if (tools.labwc) stub('labwc', `echo '${tools.labwc}'`);
  if (tools.kanshi) stub('kanshi', 'exit 0');
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
      // PATH is pinned so a labwc or kanshi on the machine running the tests
      // cannot decide what the file says.
      env: { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin` },
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

  // labwc switches a newly connected screen on by itself unless told not to,
  // and the option arrived in 0.8.3. Without kanshi nothing else would switch
  // the screen on at boot, so the option needs both.
  const TOOL_CASES: Array<{ name: string; tools: Tools; core: boolean }> = [
    { name: 'labwc 0.9.8 with kanshi leaves new screens to kanshi', tools: { labwc: 'labwc 0.9.8', kanshi: true }, core: true },
    {
      name: 'labwc 0.20.2, whose version line also names wlroots',
      tools: { labwc: 'labwc 0.20.2 (+xwayland +nls +rsvg +libsfdo) wlroots-0.20.2', kanshi: true },
      core: true,
    },
    { name: 'labwc 0.8.3 is the first that understands it', tools: { labwc: 'labwc 0.8.3', kanshi: true }, core: true },
    { name: 'labwc 0.8.1 does not get an option it would not understand', tools: { labwc: 'labwc 0.8.1', kanshi: true }, core: false },
    { name: 'labwc 0.9.8 without kanshi keeps switching screens on itself', tools: { labwc: 'labwc 0.9.8' }, core: false },
    { name: 'no labwc on PATH (a laptop) gets no option', tools: { kanshi: true }, core: false },
  ];
  for (const c of TOOL_CASES) {
    it(c.name, () => {
      const { rc, run } = sandbox('DISPLAY_TRANSFORM="90"\n', undefined, c.tools);
      expect(run('--create')).toBe('changed\n');
      expect(readFileSync(rc, 'utf-8')).toBe(withMatrix('0 -1 1 1 0 0', c.core ? CORE : ''));
    });
  }

  it('adds the option to a file it wrote before, once kanshi and a new enough labwc are there', () => {
    const { rc, run } = sandbox('DISPLAY_TRANSFORM="90"\n', withMatrix('0 -1 1 1 0 0'), { labwc: 'labwc 0.9.8', kanshi: true });
    expect(run()).toBe('changed\n');
    expect(readFileSync(rc, 'utf-8')).toBe(withMatrix('0 -1 1 1 0 0', CORE));
    expect(run()).toBe('');
  });
});
