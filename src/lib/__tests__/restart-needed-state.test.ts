import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { readRestartNeeded } from '../restart-needed-state';

/**
 * Reading the "restart to finish the update" marker that setup-system writes
 * (scripts/__tests__/restart-marker.test.ts covers the writing). It only counts
 * for the boot that wrote it; a fake boot id file stands in for the kernel's,
 * so a reboot is a change of its contents.
 */

const MARKER = path.join(process.cwd(), 'data', 'restart-needed.json');
let bootDir: string;

function boot(id: string) {
  writeFileSync(path.join(bootDir, 'boot_id'), `${id}\n`);
}

/** A marker as setup-system writes it. */
function marker(fields: Record<string, unknown>) {
  writeFileSync(MARKER, JSON.stringify({ bootId: 'boot-1', changed: ['launcher'], version: '1.14.0', at: '2026-09-27T12:00:00.000Z', ...fields }));
}

beforeEach(() => {
  bootDir = mkdtempSync(path.join(os.tmpdir(), 'boot-id-'));
  process.env.HS_BOOT_ID_PATH = path.join(bootDir, 'boot_id');
  boot('boot-1');
  rmSync(MARKER, { force: true });
});

afterEach(() => {
  delete process.env.HS_BOOT_ID_PATH;
  rmSync(bootDir, { recursive: true, force: true });
  rmSync(MARKER, { force: true });
});

describe('restart-needed marker', () => {
  it('is absent until an update records one', async () => {
    expect(await readRestartNeeded()).toBeNull();
  });

  it('offers the restart for the changes that need one, on the same boot', async () => {
    marker({ changed: ['labwc-rc', 'packages', 'session-packages', 'cmdline', 'launcher'] });
    expect(await readRestartNeeded()).toEqual({
      reasons: ['session-packages', 'launcher'],
      tag: 'v1.14.0',
      at: '2026-09-27T12:00:00.000Z',
    });
  });

  it('offers nothing when every change was live already or waits for the next boot anyway', async () => {
    marker({ changed: ['labwc-rc', 'cmdline', 'brcmfmac-modprobe'] });
    expect(await readRestartNeeded()).toBeNull();
  });

  it('clears itself once the device has restarted, and deletes the old record', async () => {
    marker({});
    boot('boot-2');
    expect(await readRestartNeeded()).toBeNull();
    expect(existsSync(MARKER)).toBe(false);
  });

  it('offers nothing where there is no boot id (a Mac, a container), even for a marker copied in', async () => {
    process.env.HS_BOOT_ID_PATH = path.join(bootDir, 'missing');
    marker({});
    expect(await readRestartNeeded()).toBeNull();
  });

  it('treats a damaged marker as no marker', async () => {
    writeFileSync(MARKER, '{not json');
    expect(await readRestartNeeded()).toBeNull();
    marker({ changed: 'launcher' });
    expect(await readRestartNeeded()).toBeNull();
  });

  it('still offers the restart when the version could not be read', async () => {
    marker({ version: null });
    expect(await readRestartNeeded()).toMatchObject({ reasons: ['launcher'], tag: null });
  });
});
