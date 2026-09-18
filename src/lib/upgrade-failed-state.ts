import { promises as fs } from 'fs';
import path from 'path';
import { getDataRoot } from './data-transaction';

/**
 * Left by `scripts/upgrade.sh finalize-deploy` when a new release never
 * answered and the previous tree was put back. The System page shows it
 * once and the user dismisses it; nothing else reads it.
 */
export interface FailedUpdate {
  /** GitHub tag of the release that did not start, with its leading "v". */
  tag: string;
  reason: string;
  /** ISO timestamp of the swap back. */
  at: string;
}

function markerPath(): string {
  return path.join(getDataRoot(), 'data', 'upgrade-failed.json');
}

export async function readFailedUpdate(): Promise<FailedUpdate | null> {
  try {
    const raw = JSON.parse(await fs.readFile(markerPath(), 'utf-8')) as Partial<FailedUpdate>;
    if (typeof raw?.tag !== 'string' || typeof raw.at !== 'string') return null;
    return { tag: raw.tag, reason: typeof raw.reason === 'string' ? raw.reason : 'unknown', at: raw.at };
  } catch {
    return null;
  }
}

export async function clearFailedUpdate(): Promise<void> {
  await fs.rm(markerPath(), { force: true });
}
