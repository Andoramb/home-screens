import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

/**
 * Which tree the privileged shell actions run from.
 *
 * The bug this exists to prevent: `/opt/home-screens/current` was hardcoded as
 * the spawn cwd, so any install that is not there died with `spawn bash
 * ENOENT` at the first step of every update. Installs from before v0.14.7 sit
 * in ~/home-screens with no migration, and a hand-unpacked tree sits wherever
 * its owner put it.
 */

const origEnv = process.env.HOME_SCREENS_DIR;
let root: string;
let cwdSpy: ReturnType<typeof vi.spyOn> | null = null;

/** Fresh module instance: the resolved answer is memoized per process. */
async function loadAppDir() {
  vi.resetModules();
  return import('../app-dir');
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'app-dir-test-'));
  delete process.env.HOME_SCREENS_DIR;
});

afterEach(() => {
  cwdSpy?.mockRestore();
  cwdSpy = null;
  rmSync(root, { recursive: true, force: true });
  if (origEnv === undefined) delete process.env.HOME_SCREENS_DIR;
  else process.env.HOME_SCREENS_DIR = origEnv;
});

/** Stand in for a tree someone unpacked themselves, scripts and all. */
function makeTree(dir: string): string {
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  writeFileSync(path.join(dir, 'scripts', 'upgrade.sh'), '#!/usr/bin/env bash\n');
  return dir;
}

describe('getAppDir', () => {
  it('takes an explicit HOME_SCREENS_DIR on trust', async () => {
    process.env.HOME_SCREENS_DIR = makeTree(path.join(root, 'srv'));
    const { getAppDir } = await loadAppDir();
    expect(getAppDir()).toBe(path.join(root, 'srv'));
  });

  it('falls back to the working directory when the default install is absent', async () => {
    // No /opt/home-screens on a dev machine or a hand-rolled install, so the
    // tree we are running from is the only sensible answer.
    const tree = makeTree(path.join(root, 'home-screens'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tree);
    const { getAppDir } = await loadAppDir();
    expect(getAppDir()).toBe(tree);
  });

  it('resolves once and keeps the answer, so a release swap cannot move it', async () => {
    const first = makeTree(path.join(root, 'first'));
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(first);
    const { getAppDir } = await loadAppDir();
    expect(getAppDir()).toBe(first);

    // getcwd follows the renamed inode during a deploy. The pinned answer must
    // not follow it into the rollback tree.
    cwdSpy.mockReturnValue(path.join(root, 'first.rollback'));
    expect(getAppDir()).toBe(first);
  });

  it('builds script paths inside the resolved tree', async () => {
    const tree = makeTree(path.join(root, 'app'));
    process.env.HOME_SCREENS_DIR = tree;
    const { appScriptPath } = await loadAppDir();
    expect(appScriptPath('upgrade.sh')).toBe(path.join(tree, 'scripts', 'upgrade.sh'));
  });

  it('re-resolves after the test seam clears it', async () => {
    const tree = makeTree(path.join(root, 'app'));
    process.env.HOME_SCREENS_DIR = tree;
    const { getAppDir, __resetAppDirForTests } = await loadAppDir();
    expect(getAppDir()).toBe(tree);

    const moved = makeTree(path.join(root, 'moved'));
    process.env.HOME_SCREENS_DIR = moved;
    expect(getAppDir()).toBe(tree);
    __resetAppDirForTests();
    expect(getAppDir()).toBe(moved);
  });
});
