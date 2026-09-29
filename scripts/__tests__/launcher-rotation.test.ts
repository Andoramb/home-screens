import { describe, it, expect } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * What the display-only launcher does about rotation and resolution.
 *
 * It hands them to kiosk-outputs.sh, which keeps them through a monitor
 * reconnect. A kiosk-update.sh from before that helper existed installs only
 * the files it knows, this launcher among them, and relaunches straight into
 * it, so for one boot the helper can be missing. The launcher then sets the
 * screen once the old way instead of leaving a portrait wall sideways.
 */

/** The launcher's rotation block, from the helper check to its closing fi. */
const BLOCK = (() => {
  const source = readFileSync(path.join(process.cwd(), 'scripts', 'kiosk-launcher-display.sh'), 'utf-8');
  const start = source.indexOf('if [ -x "${APP_DIR}/scripts/kiosk-outputs.sh" ]; then');
  if (start < 0) throw new Error('no rotation block in kiosk-launcher-display.sh');
  const end = source.indexOf('\nfi\n', start);
  return source.slice(start, end + 4);
})();

function runBlock({ helper, transform, mode }: { helper: boolean; transform?: string; mode?: string }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'launcher-rotation-'));
  const app = path.join(root, 'app');
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'calls.log');
  mkdirSync(path.join(app, 'scripts'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  const stub = (file: string, body: string) => {
    writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(file, 0o755);
  };
  // wlr-randr lists one lit screen, and logs anything it is asked to change.
  stub(path.join(bin, 'wlr-randr'), `if [ $# -eq 0 ]; then printf 'HDMI-A-2 "Panel"\\n  Enabled: yes\\n'; exit 0; fi\necho "wlr-randr $*" >> "${log}"`);
  // The launcher's short waits, made instant.
  stub(path.join(bin, 'sleep'), 'exit 0');
  if (helper) stub(path.join(app, 'scripts', 'kiosk-outputs.sh'), `echo "kiosk-outputs.sh $*" >> "${log}"`);
  const script = [
    `APP_DIR="${app}"`,
    `DISPLAY_TRANSFORM="${transform ?? ''}"`,
    `DISPLAY_MODE="${mode ?? ''}"`,
    BLOCK,
    'wait',
  ].join('\n');
  execFileSync('bash', ['-c', script], { env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` } });
  return existsSync(log) ? readFileSync(log, 'utf-8').trim().split('\n').sort() : [];
}

describe('display-only launcher rotation', () => {
  it('hands the screen settings to kiosk-outputs.sh when it is there', () => {
    expect(runBlock({ helper: true, transform: '90', mode: '1920x1080' })).toEqual(['kiosk-outputs.sh start']);
  });

  it('asks the helper even with nothing to rotate, so kanshi still keeps the screen as it is', () => {
    expect(runBlock({ helper: true })).toEqual(['kiosk-outputs.sh start']);
  });

  it('sets rotation and resolution once itself when the helper has not arrived yet', () => {
    expect(runBlock({ helper: false, transform: '90', mode: '1920x1080' })).toEqual([
      'wlr-randr --output HDMI-A-2 --mode 1920x1080',
      'wlr-randr --output HDMI-A-2 --transform 90',
    ]);
  });

  it('leaves an unrotated screen alone when the helper has not arrived yet', () => {
    expect(runBlock({ helper: false })).toEqual([]);
  });
});
