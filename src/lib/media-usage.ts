/**
 * Generic media-usage scan: walks the ENTIRE config JSON for strings that
 * reference a library file, with no field list to maintain — features that
 * start referencing images later are covered without scanner changes.
 * References come in two shapes: serve URLs (`/api/backgrounds/serve?file=…`)
 * and bare relative paths (screen backgroundImage, video module file).
 */

export type MediaUseKind = 'screen' | 'dayRule' | 'module' | 'other';
export interface MediaUse { kind: MediaUseKind; name?: string; configPath: string; }

// Every construction site puts `file` first (serve route serveUrl, rotate route,
// background-download); a param ever prepended before it needs this revisited.
const SERVE_RE = /\/api\/backgrounds\/serve\?file=([^&\s]+)/;

/** Normalize one candidate string to a library-relative path, or null. */
export function normalizeMediaRef(value: string): string | null {
  const serve = value.match(SERVE_RE);
  if (serve) {
    try { return decodeURIComponent(serve[1]); } catch { return null; }
  }
  // Bare paths: a filename plus zero or more folder segments (the library hosts
  // folders two deep, e.g. themes/christmas/clip.mp4). Anything with a leading
  // slash, a fragment, or CSS/color syntax is not one.
  if (!/^[^/\s]+(\/[^/\s]+)*$/.test(value) || value.startsWith('#')) return null;
  return value;
}

function kindFor(configPath: string): MediaUseKind {
  if (configPath.includes('dayRules')) return 'dayRule';
  if (configPath.includes('.modules[')) return 'module';
  if (configPath.includes('screens[')) return 'screen';
  return 'other';
}

/** Input must be JSON-derived (no cycles), as readConfig guarantees. */
export function scanMediaUsage(config: unknown, knownPaths: Set<string>): Map<string, MediaUse[]> {
  const usage = new Map<string, MediaUse[]>();
  const walk = (node: unknown, path: string, nearestName: string | undefined) => {
    if (typeof node === 'string') {
      const ref = normalizeMediaRef(node);
      if (ref != null && knownPaths.has(ref)) {
        const list = usage.get(ref) ?? [];
        list.push({ kind: kindFor(path), name: nearestName, configPath: path });
        usage.set(ref, list);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`, nearestName));
      return;
    }
    if (node && typeof node === 'object') {
      const name = typeof (node as Record<string, unknown>).name === 'string'
        ? (node as Record<string, unknown>).name as string
        : nearestName;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k, name);
      }
    }
  };
  walk(config, '', undefined);
  return usage;
}
