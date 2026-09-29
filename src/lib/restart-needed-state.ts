import { promises as fs } from 'fs';
import path from 'path';
import { getDataRoot } from './data-transaction';
import { restartNeededFor } from './restart-needed';

/**
 * "Restart to finish the update": what an update changed that the running
 * wall only picks up after the device restarts. The System page and the
 * phone's Settings sheet show it with a Restart now button until then.
 *
 * `scripts/upgrade.sh setup-system` writes `data/restart-needed.json`
 * (`hs_record_restart_changes`), not this process. An update runs the
 * pipeline of the release it is replacing, which may predate the file, while
 * setup-system always comes from the release being installed. It records
 * every change name it reported; which of them need a restart is decided here
 * (restart-needed.ts), and only while a kiosk session was running to be out
 * of date.
 *
 * The record is scoped to one boot: it carries the kernel's boot id from when
 * it was written and only counts while the running boot id is the same. A
 * restart therefore clears it by itself, with nothing to run at boot and no
 * way to be left stuck showing. A machine without a boot id (a Mac, a
 * container) never offers a restart it cannot make.
 */
export interface RestartNeeded {
  /** setup-system's names for the changes that need it, e.g. "launcher". For diagnostics: the pages word it themselves. */
  reasons: string[];
  /** The release whose install left the restart owed. */
  tag: string | null;
  /** ISO timestamp of the latest install that added to it. */
  at: string;
}

/** The file as setup-system writes it. */
interface RestartMarker {
  bootId: string;
  changed: string[];
  version: string | null;
  at: string;
}

const BOOT_ID_FILE = '/proc/sys/kernel/random/boot_id';

/** Test seam: HS_BOOT_ID_PATH stands in for the kernel's file, here and in upgrade.sh. Never set on a device. */
function bootIdPath(): string {
  return process.env.HS_BOOT_ID_PATH || BOOT_ID_FILE;
}

async function currentBootId(): Promise<string | null> {
  try {
    const id = (await fs.readFile(bootIdPath(), 'utf-8')).trim();
    return id || null;
  } catch {
    return null;
  }
}

function markerPath(): string {
  return path.join(getDataRoot(), 'data', 'restart-needed.json');
}

async function readMarker(): Promise<RestartMarker | null> {
  try {
    const raw = JSON.parse(await fs.readFile(markerPath(), 'utf-8')) as Partial<RestartMarker>;
    if (typeof raw?.bootId !== 'string' || typeof raw.at !== 'string' || !Array.isArray(raw.changed)) return null;
    return {
      bootId: raw.bootId,
      changed: raw.changed.filter((c): c is string => typeof c === 'string'),
      version: typeof raw.version === 'string' ? raw.version : null,
      at: raw.at,
    };
  } catch {
    return null;
  }
}

/** The restart this boot still owes, or null. A record from an earlier boot is deleted on sight. */
export async function readRestartNeeded(): Promise<RestartNeeded | null> {
  const bootId = await currentBootId();
  if (!bootId) return null;
  const marker = await readMarker();
  if (!marker) return null;
  if (marker.bootId !== bootId) {
    await fs.rm(markerPath(), { force: true }).catch(() => {});
    return null;
  }
  const reasons = restartNeededFor(marker.changed);
  if (reasons.length === 0) return null;
  return { reasons, tag: marker.version ? `v${marker.version}` : null, at: marker.at };
}
