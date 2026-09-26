import { describe, it, expect, vi } from 'vitest';
import { bumpLibraryRevision, libraryRevision } from '../library-revision';

/** The run id and counter a revision is made of. */
function parts(revision: string): { run: string; counter: number } {
  const match = /^([0-9a-z]+)\.(\d+)$/.exec(revision);
  if (!match) throw new Error(`not a <run>.<n> revision: ${revision}`);
  return { run: match[1], counter: Number(match[2]) };
}

describe('libraryRevision', () => {
  it('is a run id and a counter', () => {
    expect(libraryRevision()).toMatch(/^[0-9a-z]+\.\d+$/);
  });

  it('stays the same until the library changes', () => {
    const before = libraryRevision();
    expect(libraryRevision()).toBe(before);
    bumpLibraryRevision();
    expect(libraryRevision()).not.toBe(before);
  });

  it('moves on every bump, within the same run', () => {
    const start = libraryRevision();
    bumpLibraryRevision();
    const first = libraryRevision();
    bumpLibraryRevision();
    const second = libraryRevision();

    expect(new Set([start, first, second]).size).toBe(3);
    expect(parts(first).run).toBe(parts(start).run);
    expect(parts(second).run).toBe(parts(start).run);
    expect(parts(second).counter).toBe(parts(start).counter + 2);
  });

  it('is shared by every copy of the module, as separate route bundles each carry one', async () => {
    vi.resetModules();
    const copy = await import('../library-revision');
    expect(copy.libraryRevision()).toBe(libraryRevision());

    copy.bumpLibraryRevision();
    expect(libraryRevision()).toBe(copy.libraryRevision());
  });
});
