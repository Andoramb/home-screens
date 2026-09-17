import { existsSync } from 'fs';
import path from 'path';

/**
 * Where the installed application tree lives, for the code that shells out to
 * `scripts/upgrade.sh`.
 *
 * This is deliberately NOT `getDataRoot()`. That one answers "where does this
 * process read and write data", resolved lazily so tests can move it. This one
 * answers "which tree holds the shell scripts a privileged action must run",
 * and it has to stay pinned across an atomic release swap: after `deploy`
 * renames current/ to current.rollback/, `process.cwd()` follows the renamed
 * inode into the rollback tree, so anything resolved from cwd afterwards would
 * run the OLD release's scripts.
 *
 * The install path was hardcoded to `/opt/home-screens/current` here, which is
 * right for an installer-made device and wrong for every other shape: installs
 * from before v0.14.7 still live in ~/home-screens (nothing migrates them),
 * and a tree someone unpacked themselves lives wherever they put it. Node
 * reports a missing spawn cwd as `spawn bash ENOENT`, so those installs could
 * not update and said so in a way nobody could act on.
 */

const DEFAULT_INSTALL_BASE = '/opt/home-screens';
const DEFAULT_APP_DIR = path.join(DEFAULT_INSTALL_BASE, 'current');

function resolve(): string {
  // An explicit override wins and is taken on trust: it is how a non-default
  // install tells us where it lives.
  const override = process.env.HOME_SCREENS_DIR;
  if (override) return override;

  // The installer's own layout, proven by the scripts actually being there.
  if (existsSync(path.join(DEFAULT_APP_DIR, 'scripts', 'upgrade.sh'))) return DEFAULT_APP_DIR;

  // Same layout, caught mid-swap: current/ is briefly absent while a deploy
  // renames trees around it, and the recovery path needs the real name back,
  // not this process's working directory.
  if (existsSync(DEFAULT_INSTALL_BASE)) return DEFAULT_APP_DIR;

  return process.cwd();
}

/**
 * Resolved once per process, at first use. Callers hold module-level constants
 * built from this, so resolution happens at server start — before any release
 * swap can move the working directory out from under it.
 */
let cached: string | null = null;

export function getAppDir(): string {
  if (cached === null) cached = resolve();
  return cached;
}

/** Absolute path to one of the app's shell scripts inside the resolved tree. */
export function appScriptPath(...segments: string[]): string {
  return path.join(getAppDir(), 'scripts', ...segments);
}

/** Test seam — drops the memoized answer. */
export function __resetAppDirForTests(): void {
  cached = null;
}
