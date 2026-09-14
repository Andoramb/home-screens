import { promises as fs } from 'fs';
import path from 'path';
import { configRevision, updateConfigAtomic } from '@/lib/config';
import { rewriteMediaRefs, scanMediaUsage } from '@/lib/media-usage';
import { libraryRoot, safeLibraryPath } from '@/lib/library-files';
import { sanitizeFolderName } from '@/lib/library-folder-name';
import { ROTATION_FILE_RE } from '@/lib/background-rotation-cache';
import { removeThumbnails } from '@/lib/thumbnails';
import { fileNameOf, folderOf } from '@/lib/media-paths';
import type { ScreenConfiguration } from '@/types/config';

/**
 * Moving files between folders and renaming folders, with the config
 * following: every screen background, day rule, module file and slideshow
 * folder that named the old path is rewritten to the new one.
 *
 * Disk and config change as one step. The file moves run inside the queued
 * config update editor saves go through, so nothing else can read or write
 * the config between the move and the rewrite; if a move fails, the ones
 * already done are put back and the config is left untouched, and if the
 * config write fails after the moves, they are put back too. No path can
 * end with files in one place and references pointing at another.
 */

export const MAX_FOLDER_DEPTH = 2;

export class LibraryMoveError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** A clean `folder/name` (no empty or dot segments), or null. */
export function cleanLibraryPath(raw: string): string | null {
  const segments = raw.split('/').filter((seg) => seg !== '' && seg !== '.');
  if (segments.length === 0 || segments.some((seg) => seg === '..')) return null;
  return segments.join('/');
}

/** A clean folder path: '' for the top level, else `a` or `a/b`. */
export function cleanFolderPath(raw: string): string | null {
  if (raw === '' || raw === '/' || raw === '.') return '';
  return cleanLibraryPath(raw);
}

async function requireFolder(folder: string): Promise<string> {
  const abs = folder === '' ? libraryRoot() : safeLibraryPath(folder);
  if (!abs) throw new LibraryMoveError('Invalid folder', 400);
  try {
    if (!(await fs.stat(abs)).isDirectory()) throw new Error('not a dir');
  } catch {
    throw new LibraryMoveError('Folder not found', 404);
  }
  return abs;
}

/**
 * Move a file without ever overwriting: a hard link refuses with EEXIST when
 * the target already exists (atomically, unlike a check followed by a
 * rename), then the source is unlinked. On a filesystem that cannot link,
 * fall back to a rename guarded by a fresh existence check.
 */
async function moveNoClobber(from: string, to: string): Promise<void> {
  try {
    await fs.link(from, to);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') throw new LibraryMoveError(`${path.basename(to)} is already in that folder`, 409);
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'ENOTSUP') throw err;
    try {
      await fs.access(to);
      throw new LibraryMoveError(`${path.basename(to)} is already in that folder`, 409);
    } catch (accessErr) {
      if (accessErr instanceof LibraryMoveError) throw accessErr;
    }
    await fs.rename(from, to);
    return;
  }
  await fs.unlink(from);
}

export interface MoveResult {
  moved: { from: string; to: string }[];
  /** Config references rewritten to follow the moves. */
  rewritten: number;
  /** Revision of the config after the rewrite, for an editor holding a copy. */
  revision: string;
}

interface PlannedMove {
  from: string;
  to: string;
  absFrom: string;
  absTo: string;
}

/**
 * Move library files into `directory` under their own names. Every move is
 * checked before any file moves: a name already in the target folder, two
 * selected files sharing a name, a top-level `rotation-` name, or a file a
 * slideshow shows (moving it would take it off that screen) refuses the
 * whole batch.
 */
export async function moveLibraryFiles(files: string[], directory: string): Promise<MoveResult> {
  const folder = cleanFolderPath(directory);
  if (folder == null) throw new LibraryMoveError('Invalid folder', 400);
  const targetDir = await requireFolder(folder);

  const plan: PlannedMove[] = [];
  const seenSources = new Set<string>();
  const targetNames = new Map<string, string>();
  for (const raw of files) {
    const from = cleanLibraryPath(raw);
    const absFrom = from ? safeLibraryPath(from) : null;
    if (!from || !absFrom) throw new LibraryMoveError('Invalid path', 400);
    if (seenSources.has(from)) continue;
    seenSources.add(from);
    try {
      if (!(await fs.stat(absFrom)).isFile()) throw new Error('not a file');
    } catch {
      throw new LibraryMoveError(`File not found: ${raw}`, 404);
    }
    const name = fileNameOf(from);
    const to = folder ? `${folder}/${name}` : name;
    if (to === from) continue;
    if (!folder && ROTATION_FILE_RE.test(name)) {
      throw new LibraryMoveError(`Names starting with "rotation-" are kept for rotating backgrounds at the top level. Rename ${name} first.`, 400);
    }
    const clash = targetNames.get(name);
    if (clash) {
      throw new LibraryMoveError(`${clash} and ${from} are both called ${name}; only one can go there`, 409);
    }
    targetNames.set(name, from);
    const absTo = path.join(targetDir, name);
    try {
      await fs.access(absTo);
      throw new LibraryMoveError(`${name} is already in that folder`, 409);
    } catch (err) {
      if (err instanceof LibraryMoveError) throw err;
    }
    plan.push({ from, to, absFrom, absTo });
  }

  if (plan.length === 0) {
    return { moved: [], rewritten: 0, revision: configRevision(await readCurrentConfig()) };
  }

  const done: PlannedMove[] = [];
  const rollback = async () => {
    for (const step of done.splice(0).reverse()) {
      await moveNoClobber(step.absTo, step.absFrom).catch(() => { /* best effort */ });
    }
  };

  let rewritten = 0;
  let next: ScreenConfiguration | null = null;
  try {
    next = await updateConfigAtomic(async (current) => {
      refuseSlideshowMembers(current, plan);
      try {
        for (const step of plan) {
          await moveNoClobber(step.absFrom, step.absTo);
          done.push(step);
        }
      } catch (err) {
        await rollback();
        throw err;
      }
      const byFrom = new Map(plan.map((m) => [m.from, m.to]));
      const result = rewriteMediaRefs(current, (p) => byFrom.get(p) ?? null, () => null);
      rewritten = result.changed;
      return result.config;
    });
  } catch (err) {
    // Either the moves threw (already rolled back) or the config write did.
    await rollback();
    throw err;
  }
  await Promise.all(plan.map((step) => removeThumbnails(step.from)));
  return { moved: plan.map(({ from, to }) => ({ from, to })), rewritten, revision: configRevision(next) };
}

/** A file a slideshow shows belongs to that folder on the wall; moving it
 *  out would silently change what the screen plays. */
function refuseSlideshowMembers(config: ScreenConfiguration, plan: PlannedMove[]): void {
  const usage = scanMediaUsage(config, new Set(plan.map((step) => step.from)));
  for (const step of plan) {
    const slideshow = (usage.get(step.from) ?? []).find((use) => use.kind === 'slideshow');
    if (slideshow) {
      const where = slideshow.name ? `on '${slideshow.name}'` : 'on a screen';
      throw new LibraryMoveError(
        `${fileNameOf(step.from)} is part of the slideshow ${where}. Moving it would take it off that screen, so move the whole folder instead.`,
        409,
      );
    }
  }
}

async function readCurrentConfig(): Promise<ScreenConfiguration> {
  return updateConfigAtomic((current) => current);
}

export interface RenameResult {
  from: string;
  to: string;
  rewritten: number;
  revision: string;
}

/**
 * Rename one folder (its last segment; the parent stays). Files inside and
 * in any subfolder keep their names, and every reference to them, plus any
 * slideshow showing the folder or a subfolder, follows the new spelling.
 */
export async function renameLibraryFolder(current: string, newName: string): Promise<RenameResult> {
  const from = cleanFolderPath(current);
  if (!from) throw new LibraryMoveError('Invalid folder', 400);
  const absFrom = await requireFolder(from);
  const safeName = sanitizeFolderName(newName);
  if (!safeName) throw new LibraryMoveError('Invalid folder name', 400);
  const parent = folderOf(from);
  const to = parent ? `${parent}/${safeName}` : safeName;
  if (to === from) {
    return { from, to, rewritten: 0, revision: configRevision(await readCurrentConfig()) };
  }
  if (to.split('/').length > MAX_FOLDER_DEPTH) throw new LibraryMoveError('Maximum folder depth is 2', 400);
  const absTo = safeLibraryPath(to);
  if (!absTo) throw new LibraryMoveError('Invalid folder name', 400);
  try {
    await fs.access(absTo);
    throw new LibraryMoveError(`A folder called ${safeName} is already there`, 409);
  } catch (err) {
    if (err instanceof LibraryMoveError) throw err;
  }

  const files = await listFilesUnder(absFrom, from);
  const prefix = `${from}/`;
  let renamed = false;
  let rewritten = 0;
  let next: ScreenConfiguration;
  try {
    next = await updateConfigAtomic(async (config) => {
      await fs.rename(absFrom, absTo);
      renamed = true;
      const result = rewriteMediaRefs(
        config,
        (p) => (p.startsWith(prefix) ? to + p.slice(from.length) : null),
        (folder) => (folder === from ? to : folder.startsWith(prefix) ? to + folder.slice(from.length) : null),
      );
      rewritten = result.changed;
      return result.config;
    });
  } catch (err) {
    if (renamed) await fs.rename(absTo, absFrom).catch(() => { /* best effort */ });
    throw err;
  }
  // Thumbnails are keyed by path, so every copy under the old name is dead.
  await Promise.all(files.map((f) => removeThumbnails(f)));
  return { from, to, rewritten, revision: configRevision(next) };
}

async function listFilesUnder(absDir: string, rel: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const relPath = `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await listFilesUnder(path.join(absDir, entry.name), relPath));
    else if (entry.isFile()) out.push(relPath);
  }
  return out;
}
