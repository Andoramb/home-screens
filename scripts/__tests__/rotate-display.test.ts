import { describe, it, expect } from 'vitest';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * What scripts/rotate-display.sh does to kiosk.conf and the running screen.
 *
 * It ships to display-only Pis in the kiosk bundle, where kiosk.conf also
 * holds the hub's address and the display's id. It used to rewrite the file
 * from the four keys it knew, which erased those and left a launcher that
 * refuses to start. It also runs there without lib/common.sh beside it.
 */

/**
 * A throwaway app dir shaped like a display-only Pi: the script, no lib/.
 * `outputsExit` is what the stand-in for kiosk-outputs.sh answers (3 is "no
 * kiosk session"), or null for a display that does not have the helper yet.
 * `asRoot` puts an `id` on PATH that answers 0, as under sudo.
 */
function sandbox(kioskConf: string | null, { outputsExit = 0, asRoot = false }: { outputsExit?: number | null; asRoot?: boolean } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rotate-display-'));
  const app = path.join(root, 'app');
  const home = path.join(root, 'home');
  mkdirSync(path.join(app, 'scripts'), { recursive: true });
  mkdirSync(path.join(app, 'data'), { recursive: true });
  mkdirSync(home, { recursive: true });
  cpSync(path.join(process.cwd(), 'scripts', 'rotate-display.sh'), path.join(app, 'scripts', 'rotate-display.sh'));
  // Stand-in for kiosk-outputs.sh: records how it was asked to set the screen,
  // and what kiosk.conf said at that moment.
  const outputsLog = path.join(root, 'outputs.log');
  const stub = path.join(app, 'scripts', 'kiosk-outputs.sh');
  if (outputsExit != null) {
    writeFileSync(stub, `#!/usr/bin/env bash\necho "$* $(grep '^DISPLAY_TRANSFORM=' "${app}/data/kiosk.conf" || echo none)" >> "${outputsLog}"\nexit ${outputsExit}\n`);
    chmodSync(stub, 0o755);
  }
  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  if (asRoot) {
    writeFileSync(path.join(bin, 'id'), '#!/usr/bin/env bash\necho 0\n');
    chmodSync(path.join(bin, 'id'), 0o755);
  }
  const conf = path.join(app, 'data', 'kiosk.conf');
  if (kioskConf != null) writeFileSync(conf, kioskConf);
  const run = (...args: string[]) =>
    spawnSync('bash', [path.join(app, 'scripts', 'rotate-display.sh'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
    });
  const outputsCalls = () => (existsSync(outputsLog) ? readFileSync(outputsLog, 'utf8').trim().split('\n') : []);
  return { conf, run, outputsCalls, home };
}

const SPOKE_CONF = [
  'DISPLAY_URL="http://hub.local:3000/display/kitchen"',
  'BACKEND_URL="http://hub.local:3000"',
  'DISPLAY_ID="kitchen"',
  'DISPLAY_MODE="1920x1080"',
  'DISPLAY_TRANSFORM="90"',
  '',
].join('\n');

describe('rotate-display.sh', () => {
  it('changes only the rotation, keeping the hub address and display id', () => {
    const { conf, run } = sandbox(SPOKE_CONF);
    const result = run('270');
    expect(result.status).toBe(0);
    const lines = readFileSync(conf, 'utf8').trim().split('\n');
    expect(lines).toContain('DISPLAY_URL="http://hub.local:3000/display/kitchen"');
    expect(lines).toContain('BACKEND_URL="http://hub.local:3000"');
    expect(lines).toContain('DISPLAY_ID="kitchen"');
    expect(lines).toContain('DISPLAY_MODE="1920x1080"');
    expect(lines).toContain('DISPLAY_TRANSFORM="270"');
    expect(lines.filter((l) => l.startsWith('DISPLAY_TRANSFORM='))).toHaveLength(1);
  });

  it('removes the rotation line for landscape', () => {
    const { conf, run } = sandbox(SPOKE_CONF);
    expect(run('0').status).toBe(0);
    const text = readFileSync(conf, 'utf8');
    expect(text).not.toContain('DISPLAY_TRANSFORM');
    expect(text).toContain('DISPLAY_ID="kitchen"');
  });

  it('puts the rotation on the screen through kiosk-outputs.sh, after saving it', () => {
    const { run, outputsCalls } = sandbox(SPOKE_CONF);
    expect(run('180').status).toBe(0);
    expect(outputsCalls()).toEqual(['apply DISPLAY_TRANSFORM="180"']);
  });

  it('refuses anything but the four rotations and leaves the file alone', () => {
    const { conf, run, outputsCalls } = sandbox(SPOKE_CONF);
    const result = run('90"; touch /tmp/pwned; "');
    expect(result.status).toBe(1);
    expect(readFileSync(conf, 'utf8')).toBe(SPOKE_CONF);
    expect(outputsCalls()).toEqual([]);
  });

  it('creates kiosk.conf when there is none', () => {
    const { conf, run } = sandbox(null);
    expect(run('90').status).toBe(0);
    expect(readFileSync(conf, 'utf8')).toBe('DISPLAY_TRANSFORM="90"\n');
  });

  it('runs without lib/common.sh beside it', () => {
    const { run } = sandbox(SPOKE_CONF);
    const result = run('90');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Display rotated 90');
  });

  it('keeps the file itself, and so its owner, instead of putting a new one in its place', () => {
    // The app rewrites kiosk.conf on every save. A file renamed over it would
    // belong to whoever ran the script, and the app could not write it again.
    const { conf, run } = sandbox(SPOKE_CONF);
    const before = statSync(conf).ino;
    expect(run('270').status).toBe(0);
    expect(statSync(conf).ino).toBe(before);
    expect(readFileSync(conf, 'utf8')).toContain('DISPLAY_TRANSFORM="270"');
  });

  it('leaves no temporary file beside kiosk.conf', () => {
    const { conf, run } = sandbox(SPOKE_CONF);
    expect(run('270').status).toBe(0);
    rmSync(conf);
    expect(readdirSync(path.dirname(conf))).toEqual([]);
  });

  it.each([
    ['no kiosk session is running for this user', 3],
    ['the display does not have the helper yet', null],
  ])('says the rotation waits for a restart when %s', (_label, outputsExit) => {
    const { conf, run } = sandbox(SPOKE_CONF, { outputsExit });
    const result = run('270');
    expect(result.status).toBe(0);
    expect(readFileSync(conf, 'utf8')).toContain('DISPLAY_TRANSFORM="270"');
    expect(result.stdout).toContain('Rotation saved. It takes effect the next time this device restarts.');
    expect(result.stdout).not.toContain('Display rotated');
  });

  it('refuses to run as root and changes nothing', () => {
    const { conf, run, outputsCalls } = sandbox(SPOKE_CONF, { asRoot: true });
    const result = run('270');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('without sudo');
    expect(readFileSync(conf, 'utf8')).toBe(SPOKE_CONF);
    expect(outputsCalls()).toEqual([]);
  });

  it('leaves a wlr-randr line that is not a rotation in labwc autostart', () => {
    const { run, home } = sandbox(SPOKE_CONF);
    const autostart = path.join(home, '.config', 'labwc', 'autostart');
    mkdirSync(path.dirname(autostart), { recursive: true });
    const own = 'wlr-randr --output HDMI-A-2 --off &\n';
    writeFileSync(autostart, `${own}(sleep 2 && wlr-randr --output "HDMI-A-1" --transform 90) &\n`);
    expect(run('270').status).toBe(0);
    expect(readFileSync(autostart, 'utf8')).toBe(own);
  });

  it('takes the old wlr-randr rotation out of labwc autostart', () => {
    const { run, home } = sandbox(SPOKE_CONF);
    const autostart = path.join(home, '.config', 'labwc', 'autostart');
    mkdirSync(path.dirname(autostart), { recursive: true });
    writeFileSync(autostart, 'swaybg -c "#000000" &\n(sleep 2 && wlr-randr --output "HDMI-A-1" --transform 90) &\n');
    const result = run('270');
    expect(result.status).toBe(0);
    expect(readFileSync(autostart, 'utf8')).toBe('swaybg -c "#000000" &\n');
  });
});
