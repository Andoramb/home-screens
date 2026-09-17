import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, chmodSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';

/**
 * The boot splash must never fail an install or an update.
 *
 * `plymouth-set-default-theme` is a Debian binary. Raspberry Pi OS has it at
 * /usr/sbin; Ubuntu ships it in no package at any path and manages the theme
 * through the default.plymouth alternative instead. This used to be called by
 * its literal Debian path, so on Ubuntu it aborted `setup-system` under
 * `set -euo pipefail`: install.sh died at its last step, and every editor
 * update died at "Applying system configuration..." after the atomic swap,
 * leaving the new release in place but never restarted.
 *
 * These run the real function with a fabricated PATH, so each distro shape is
 * exercised without needing that distro.
 */

const SCRIPTS = path.join(process.cwd(), 'scripts');
const COMMON = path.join(SCRIPTS, 'lib/common.sh');

interface Host {
  /** Debian/Pi OS: the helper binary exists. */
  setter?: boolean;
  /** Ubuntu: no helper, but update-alternatives is there. */
  alternatives?: boolean;
  /** The helper exists but fails (no write access, broken plymouth install). */
  setterFails?: boolean;
}

/**
 * Run `hs_set_plymouth_theme` against a fabricated host and report what it did.
 * `sudo` becomes a passthrough and PATH holds only the fakes, so nothing here
 * can reach the real system.
 */
function runTheme(host: Host, themeChanged = true): { rc: number; log: string; out: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'boot-splash-test-'));
  try {
    const bin = path.join(root, 'bin');
    const themeDir = path.join(root, 'themes/home-screens');
    mkdirSync(bin, { recursive: true });
    mkdirSync(themeDir, { recursive: true });
    writeFileSync(path.join(themeDir, 'home-screens.plymouth'), '[Plymouth Theme]\n');
    const log = path.join(root, 'calls.log');

    const fake = (name: string, body: string) => {
      const p = path.join(bin, name);
      writeFileSync(p, `#!/bin/sh\n${body}\n`);
      chmodSync(p, 0o755);
    };
    fake('update-initramfs', `echo "update-initramfs $*" >> "${log}"`);
    if (host.setter) {
      fake(
        'plymouth-set-default-theme',
        host.setterFails
          ? `echo "setter $* (failing)" >> "${log}"; exit 1`
          : `echo "setter $*" >> "${log}"; [ $# -eq 0 ] && echo ubuntu-logo; exit 0`,
      );
    }
    if (host.alternatives) {
      fake('update-alternatives', `echo "update-alternatives $*" >> "${log}"`);
    }

    // `set -euo pipefail` mirrors upgrade.sh: the point of the test is that a
    // missing or broken tool never takes the caller down with it.
    const out = execFileSync('bash', ['-c', `
      set -euo pipefail
      PATH="${bin}:/usr/bin:/bin"
      source "${COMMON}"
      sudo() { "$@"; }
      hs_set_plymouth_theme "${themeDir}" ${themeChanged ? 'true' : 'false'} && echo "rc=0" || echo "rc=$?"
      echo "survived"
    `], { encoding: 'utf8' });

    const rcLine = out.match(/rc=(\d+)/);
    expect(out, 'the caller did not survive the call').toContain('survived');
    return {
      rc: rcLine ? Number(rcLine[1]) : -1,
      log: existsSync(log) ? readFileSync(log, 'utf8') : '',
      out,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('hs_set_plymouth_theme', () => {
  const common = readFileSync(COMMON, 'utf-8');

  it('never invokes the Debian helper by its absolute path', () => {
    // Calling the literal path is what broke Ubuntu. The path may only appear
    // as something to probe for, never as something to run.
    const invocations = common
      .split('\n')
      .filter((line) => /\/usr\/(s?bin)\/plymouth-set-default-theme/.test(line))
      .filter((line) => !/^\s*for candidate in /.test(line));
    expect(invocations).toEqual([]);
  });

  it('looks in /usr/sbin directly, because Debian keeps it off a user PATH', () => {
    expect(common).toContain('/usr/sbin/plymouth-set-default-theme /usr/bin/plymouth-set-default-theme');
  });

  it('uses the helper when the distro has one', () => {
    const { rc, log } = runTheme({ setter: true });
    expect(log).toContain('setter home-screens');
    expect(log).toContain('update-initramfs -u');
    expect(rc).toBe(0);
  });

  it('leaves a theme that is already set alone', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'boot-splash-set-'));
    try {
      const bin = path.join(root, 'bin');
      mkdirSync(bin, { recursive: true });
      const p = path.join(bin, 'plymouth-set-default-theme');
      writeFileSync(p, '#!/bin/sh\n[ $# -eq 0 ] && echo home-screens\nexit 0\n');
      chmodSync(p, 0o755);
      const out = execFileSync('bash', ['-c', `
        set -euo pipefail
        PATH="${bin}:/usr/bin:/bin"
        source "${COMMON}"
        sudo() { "$@"; }
        hs_set_plymouth_theme "${root}" false && echo "rc=0" || echo "rc=$?"
      `], { encoding: 'utf8' });
      expect(out).toContain('rc=1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to the default.plymouth alternative when there is no helper', () => {
    const { rc, log } = runTheme({ alternatives: true });
    expect(log).toContain('update-alternatives --install');
    expect(log).toContain('update-alternatives --set default.plymouth');
    expect(log).toContain('update-initramfs -u');
    expect(rc).toBe(0);
  });

  it('carries on, without failing, when the host offers neither', () => {
    const { rc, out, log } = runTheme({});
    expect(rc).toBe(1);
    expect(log).toBe('');
    expect(out).toMatch(/no way to set a boot splash theme/);
  });

  it('carries on, without failing, when the helper itself fails', () => {
    const { rc, out } = runTheme({ setter: true, setterFails: true });
    expect(rc).toBe(1);
    expect(out).toMatch(/Could not set the boot splash theme/);
  });

  it('says so in plain language, with no jargon about initramfs or themes engines', () => {
    const { out } = runTheme({});
    expect(out).toMatch(/Everything else is unaffected/);
    expect(out).not.toMatch(/initramfs|plymouth-set-default-theme/i);
  });
});
