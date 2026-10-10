import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import os from 'os';
import path from 'path';

/**
 * How setup-system keeps the programs the kiosk runs current.
 *
 * `hs_upgrade_system_packages` (upgrade.sh) brings SYSTEM_PACKAGES to the
 * archive's newest version on every install. It is run here exactly as the
 * script defines it, against stubs for apt-get, dpkg, dpkg-query, apt-mark,
 * df, sudo and timeout, with a fake dpkg database the apt-get stub bumps.
 * Everything in it is best effort: the one thing it must never do is fail
 * the install.
 */

const UPGRADE = readFileSync(path.join(process.cwd(), 'scripts', 'upgrade.sh'), 'utf-8');
const COMMON = readFileSync(path.join(process.cwd(), 'scripts', 'lib', 'common.sh'), 'utf-8');

function definition(name: string): string {
  const start = UPGRADE.indexOf(`${name}() {`);
  if (start < 0) throw new Error(`no ${name} in upgrade.sh`);
  const end = UPGRADE.indexOf('\n}\n', start);
  return UPGRADE.slice(start, end + 3);
}

let root: string;
let app: string;
let bin: string;

/** The fake dpkg database: name=version per line. */
const db = () => path.join(root, 'dpkg.db');
/** What the archive would upgrade to: name=version per line. */
const archive = () => path.join(root, 'archive.db');
const callLog = () => path.join(root, 'calls.log');
const calls = () => (existsSync(callLog()) ? readFileSync(callLog(), 'utf-8').trim().split('\n') : []);

function stub(name: string, body: string) {
  writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path.join(bin, name), 0o755);
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'system-packages-'));
  app = path.join(root, 'current');
  bin = path.join(root, 'bin');
  mkdirSync(path.join(app, 'data'), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(db(), 'chromium=150.0.1-1\nlabwc=0.9.8-1+rpt1\nkanshi=1.5.1-1\nwlopm=0.1.0-1\nwlr-randr=0.2.0-2\nwtype=0.4-1\nvim=2:9.1-1\n');
  writeFileSync(archive(), 'chromium=154.0.8037.92-1~deb13u1\nlabwc=0.20.2-1~bpo13+1\nkanshi=1.5.1-1\nwlopm=0.1.0-1\nwlr-randr=0.2.0-2\nwtype=0.4-1\n');
  // sudo and timeout run what they are given; the log keeps the arguments.
  stub('sudo', 'echo "sudo $*" >> "$HS_CALLS"; [ "$1" = "env" ] && shift && while [[ "$1" == *=* ]]; do shift; done; exec "$@"');
  stub('timeout', 'shift; exec "$@"');
  stub('env', 'while [[ "${1:-}" == *=* ]]; do shift; done; exec "$@"');
  stub('dpkg', '[ "$1" = "-s" ] && grep -q "^$2=" "$HS_DB"');
  stub('dpkg-query', [
    'shift 2',
    'for p in "$@"; do v=$(grep "^$p=" "$HS_DB" | cut -d= -f2-); [ -n "$v" ] && printf "%s %s\\n" "$p" "$v"; done',
  ].join('\n'));
  // apt-mark logs hold/unhold and answers showhold from the held file.
  stub('apt-mark', 'if [ "$1" = "showhold" ]; then cat "$HS_HELD" 2>/dev/null; exit 0; fi; echo "apt-mark $*" >> "$HS_CALLS"');
  stub('df', 'printf "Avail\\n%s\\n" "${HS_FREE_KB:-8000000}"');
  // apt-get update fails while the archive-down file exists; install
  // --only-upgrade moves every named package to the archive's version.
  stub('apt-get', [
    'echo "apt-get $*" >> "$HS_CALLS"',
    'case "$1" in',
    '  update) [ ! -e "$HS_ARCHIVE_DOWN" ] ;;',
    '  install)',
    '    case " $* " in *" --download-only "*) [ -e "$HS_DOWNLOAD_FAILS" ] && exit 124; exit 0 ;; esac',
    '    [ -e "$HS_INSTALL_FAILS" ] && exit 100',
    '    for a in "$@"; do',
    '      case "$a" in -*|install) continue ;; esac',
    '      new=$(grep "^$a=" "$HS_ARCHIVE" | cut -d= -f2-)',
    '      [ -n "$new" ] && sed -i.bak "s|^$a=.*|$a=$new|" "$HS_DB"',
    '    done ;;',
    'esac',
  ].join('\n'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(snippet: string, env: Record<string, string> = {}) {
  const common = COMMON.match(/^SYSTEM_PACKAGES="[^"]+"$/m)![0];
  const script = [
    'set -euo pipefail',
    `APP_DIR="${app}"`,
    env.SYSTEM_PACKAGES ? '' : common,
    'SYSTEM_PACKAGE_HOLDS="${SYSTEM_PACKAGE_HOLDS:-}"',
    definition('hs_package_versions'),
    definition('hs_write_system_packages_record'),
    definition('hs_upgrade_system_packages'),
    snippet,
  ].join('\n');
  return execFileSync('bash', ['-c', script], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HS_CALLS: callLog(),
      HS_DB: db(),
      HS_ARCHIVE: archive(),
      HS_ARCHIVE_DOWN: path.join(root, 'archive-down'),
      HS_INSTALL_FAILS: path.join(root, 'install-fails'),
      HS_DOWNLOAD_FAILS: path.join(root, 'download-fails'),
      HS_HELD: path.join(root, 'held'),
      ...env,
    },
  });
}

const upgraded = (out: string) => out.trim().split('\n').pop();
const record = () => JSON.parse(readFileSync(path.join(app, 'data', 'system-packages.json'), 'utf-8'));

describe('hs_upgrade_system_packages', () => {
  it('brings the programs the kiosk runs to the archive version and names the ones that changed', () => {
    const out = run('hs_upgrade_system_packages; echo "upgraded=${HS_UPGRADED_PACKAGES}"');
    expect(upgraded(out)).toBe('upgraded=chromium labwc');
    expect(readFileSync(db(), 'utf-8')).toContain('labwc=0.20.2-1~bpo13+1');
    const apt = calls().filter((c) => c.startsWith('apt-get'));
    expect(apt[0]).toMatch(/^apt-get update -qq -o DPkg::Lock::Timeout=60 -o Acquire::Retries=2$/);
    // The download is its own bounded step, then the install from the cache.
    expect(apt[1]).toMatch(/^apt-get install --only-upgrade --download-only -y -qq .* chromium labwc kanshi wlopm wlr-randr wtype$/);
    expect(apt[2]).toMatch(/^apt-get install --only-upgrade -y -qq .* chromium labwc kanshi wlopm wlr-randr wtype$/);
    expect(apt).toHaveLength(3);
    // Never a package that is not installed, never vim.
    expect(apt[2]).not.toContain('vim');
    expect(record()).toMatchObject({ versions: { chromium: '154.0.8037.92-1~deb13u1', labwc: '0.20.2-1~bpo13+1', kanshi: '1.5.1-1' } });
    expect(new Date(record().checkedAt).getTime()).not.toBeNaN();
  });

  it('reports nothing when everything is already current', () => {
    writeFileSync(db(), readFileSync(archive(), 'utf-8'));
    const out = run('hs_upgrade_system_packages; echo "upgraded=${HS_UPGRADED_PACKAGES}"');
    expect(upgraded(out)).toBe('upgraded=');
    expect(existsSync(path.join(app, 'data', 'system-packages.json'))).toBe(true);
  });

  it('skips the archive entirely in the image build', () => {
    const out = run('hs_upgrade_system_packages; echo "upgraded=${HS_UPGRADED_PACKAGES}"', { HS_CHROOT: '1' });
    expect(upgraded(out)).toBe('upgraded=');
    expect(calls()).toEqual([]);
  });

  it('leaves everything alone when the archive cannot be reached, and still records what is installed', () => {
    writeFileSync(path.join(root, 'archive-down'), '');
    const out = run('hs_upgrade_system_packages; echo "upgraded=${HS_UPGRADED_PACKAGES}"');
    expect(out).toContain('Could not reach the package archive');
    expect(upgraded(out)).toBe('upgraded=');
    expect(calls().some((c) => c.includes('--only-upgrade'))).toBe(false);
    expect(record().versions.labwc).toBe('0.9.8-1+rpt1');
  });

  it('does not start when the disk has no room to unpack Chromium', () => {
    const out = run('hs_upgrade_system_packages; echo "upgraded=${HS_UPGRADED_PACKAGES}"', { HS_FREE_KB: '100000' });
    expect(out).toContain('Not enough free space');
    expect(calls().some((c) => c.startsWith('apt-get'))).toBe(false);
  });

  it('never fails the install when apt-get itself fails', () => {
    writeFileSync(path.join(root, 'install-fails'), '');
    const out = run('hs_upgrade_system_packages; echo "upgraded=${HS_UPGRADED_PACKAGES}"; echo still-running');
    expect(out).toContain('did not finish');
    expect(out.trim().endsWith('still-running')).toBe(true);
  });

  it('leaves held packages out of the request, so one held update cannot block the rest', () => {
    writeFileSync(path.join(root, 'held'), 'labwc\n');
    const out = run('hs_upgrade_system_packages; echo "upgraded=${HS_UPGRADED_PACKAGES}"');
    expect(upgraded(out)).toBe('upgraded=chromium');
    const install = calls().find((c) => c.includes('--only-upgrade -y'))!;
    expect(install).not.toContain('labwc');
    expect(readFileSync(db(), 'utf-8')).toContain('labwc=0.9.8-1+rpt1');
    // The record still names every installed package, held ones included.
    expect(record().versions.labwc).toBe('0.9.8-1+rpt1');
  });

  it('asks apt for nothing when every package is held', () => {
    writeFileSync(path.join(root, 'held'), 'chromium labwc kanshi wlopm wlr-randr wtype\n');
    run('hs_upgrade_system_packages');
    expect(calls().some((c) => c.startsWith('apt-get'))).toBe(false);
  });

  it('stops after a download that does not finish in time, leaving the install for next time', () => {
    writeFileSync(path.join(root, 'download-fails'), '');
    const out = run('hs_upgrade_system_packages; echo "upgraded=${HS_UPGRADED_PACKAGES}"');
    expect(out).toContain('Still downloading');
    expect(upgraded(out)).toBe('upgraded=');
    expect(calls().some((c) => /--only-upgrade -y/.test(c))).toBe(false);
    expect(readFileSync(db(), 'utf-8')).toContain('chromium=150.0.1-1');
  });

  it('keeps every apt call inside the ten minutes the server allows setup-system', () => {
    const fn = definition('hs_upgrade_system_packages');
    const budgets = [...fn.matchAll(/HS_APT_[A-Z]+_TIMEOUT:-(\d+)/g)].map((m) => Number(m[1]));
    expect(budgets).toEqual([60, 240, 180]);
    expect(budgets.reduce((a, b) => a + b, 0)).toBeLessThan(540);
  });

  it('places the release\'s holds and releases only the holds it placed before', () => {
    writeFileSync(path.join(app, 'data', 'system-package-holds'), 'labwc\n');
    run('hs_upgrade_system_packages', { SYSTEM_PACKAGE_HOLDS: 'chromium' });
    const marks = calls().filter((c) => c.startsWith('apt-mark'));
    expect(marks).toEqual(['apt-mark unhold labwc', 'apt-mark hold chromium']);
    expect(readFileSync(path.join(app, 'data', 'system-package-holds'), 'utf-8').trim()).toBe('chromium');
  });

  it('counts every program in the list as one the session runs', () => {
    const out = run([
      definition('hs_installs_session_package'),
      'for p in chromium labwc kanshi wlopm wlr-randr wtype; do hs_installs_session_package "$p" && echo "yes $p"; done',
      'hs_installs_session_package vim fonts-dejavu-core && echo "yes vim" || echo "no vim"',
    ].join('\n'));
    expect(out.trim().split('\n')).toEqual(['yes chromium', 'yes labwc', 'yes kanshi', 'yes wlopm', 'yes wlr-randr', 'yes wtype', 'no vim']);
  });
});
