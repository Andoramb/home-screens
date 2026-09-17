import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describeSpawnFailure } from '../upgrade';

/**
 * What a failed update says to the person holding the device.
 *
 * "preflight failed: spawn bash ENOENT" is what users actually got, for two
 * different causes that Node reports identically: the install tree not being
 * where we looked, and the device having no bash. Neither is something a
 * syscall name helps with.
 */

const enoent = (): NodeJS.ErrnoException =>
  Object.assign(new Error('spawn bash ENOENT'), { code: 'ENOENT' });

let root: string;

beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'update-msg-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function realTree(): { cwd: string; script: string } {
  const cwd = path.join(root, 'app');
  mkdirSync(path.join(cwd, 'scripts'), { recursive: true });
  const script = path.join(cwd, 'scripts', 'upgrade.sh');
  writeFileSync(script, '#!/usr/bin/env bash\n');
  return { cwd, script };
}

describe('describeSpawnFailure', () => {
  it('names the folder it looked in when the install tree is not there', () => {
    const missing = path.join(root, 'nowhere');
    const message = describeSpawnFailure(enoent(), missing, path.join(missing, 'scripts/upgrade.sh'));
    expect(message).toContain(missing);
    expect(message).toContain('could not find its own files');
  });

  it('says so plainly when the device has no bash', () => {
    const { cwd, script } = realTree();
    expect(describeSpawnFailure(enoent(), cwd, script)).toBe(
      'This device has no bash shell, which Home Screens needs to install an update.',
    );
  });

  it('never repeats the raw syscall text at a user', () => {
    const missing = path.join(root, 'nowhere');
    const { cwd, script } = realTree();
    for (const message of [
      describeSpawnFailure(enoent(), missing, path.join(missing, 'scripts/upgrade.sh')),
      describeSpawnFailure(enoent(), cwd, script),
    ]) {
      expect(message).not.toContain('ENOENT');
      expect(message).not.toContain('spawn bash');
    }
  });

  it('passes any other failure through untouched', () => {
    const { cwd, script } = realTree();
    const other = Object.assign(new Error('spawn EACCES'), { code: 'EACCES' });
    expect(describeSpawnFailure(other, cwd, script)).toBe('spawn EACCES');
  });
});
