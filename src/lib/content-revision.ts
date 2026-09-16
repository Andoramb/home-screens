import { createHash } from 'crypto';

/**
 * A short content hash, quoted back by clients that replace a stored list
 * whole (`chores`, `rewards`, the meal arrays). The store compares it with the
 * hash of what is on disk and refuses a save built from an older copy, so two
 * phones that both loaded `[original]` cannot silently reduce each other's
 * `[original, A]` and `[original, B]` to whichever landed last. Content-based,
 * so nothing extra is stored and server-side writers need no bookkeeping.
 * Server-only (node crypto).
 */
export function contentRevision(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}
