/**
 * Which version a device may install next.
 *
 * A release can declare two things in its GitHub release body, each as an
 * HTML comment so it never shows on the release page:
 *
 *   <!-- home-screens-requires: 1.43.0 -->   the floor a device must already
 *                                             be on before installing this
 *                                             release (a comma list is
 *                                             accepted; every entry applies)
 *   <!-- home-screens-schema: 13 -->          the newest config schema this
 *                                             release can read
 *
 * The floor exists so a later major can drop the migrations that came
 * before it: every device is sent through the last release that still
 * carried them. The schema line guards the other direction: a step back to
 * a release that cannot read the settings on disk would leave them stamped
 * with a number that release trusts and a shape it does not understand.
 *
 * Both markers are written by `scripts/release.sh` from constants in code
 * (`REQUIRED_FLOORS` and `getLatestSchemaVersion()` in the migrations
 * module). A release with neither behaves exactly as before this existed.
 *
 * Pure: no I/O. The one lookup it needs (a floor release that has fallen
 * off the release page) is passed in.
 */
import { compareSemver } from './semver';

export interface ReleaseMarkers {
  /** Versions the device must be at or above, sorted ascending. */
  requires: string[];
  /** Newest config schema the release reads, or null when undeclared. */
  schema: number | null;
}

/** The subset of a release tag the policy reasons about. */
export interface PolicyTag {
  version: string;
  requires?: string[];
  schema?: number;
}

export interface InstallTargetResolution<T extends PolicyTag> {
  /** What installing now gives you, or null when nothing may be offered. */
  target: T | null;
  /** The version waiting behind `target` when `target` is a required step. */
  requiredStepFor: string | null;
  /** A floor the newest release needs that no source could find. */
  missingStep: string | null;
  /** The newest release is a step back that cannot read the local settings. */
  blockedDowngrade: string | null;
}

const VERSION_RE = /^\d+\.\d+\.\d+(-[A-Za-z0-9.]+)?$/;
const REQUIRES_RE = /<!--\s*home-screens-requires:\s*([^>]*?)\s*-->/i;
const SCHEMA_RE = /<!--\s*home-screens-schema:\s*(\d+)\s*-->/i;

/** Most hops a floor chain may take. Ten majors behind is not a real device. */
const MAX_FLOOR_HOPS = 10;

/** "v1.2.3" and "1.2.3" both mean 1.2.3. */
export function versionOfTag(tag: string): string {
  return tag.replace(/^v/, '');
}

/** Read the markers off a release body. Anything malformed is ignored. */
export function parseReleaseMarkers(body: string | null | undefined): ReleaseMarkers {
  const text = body ?? '';
  const requires: string[] = [];
  const requiresMatch = REQUIRES_RE.exec(text);
  if (requiresMatch) {
    for (const raw of requiresMatch[1].split(',')) {
      const version = versionOfTag(raw.trim());
      if (VERSION_RE.test(version) && !requires.includes(version)) requires.push(version);
    }
    requires.sort(compareSemver);
  }
  const schemaMatch = SCHEMA_RE.exec(text);
  const schema = schemaMatch ? Number.parseInt(schemaMatch[1], 10) : null;
  return { requires, schema: schema !== null && Number.isFinite(schema) ? schema : null };
}

/** The lowest floor of `tag` the running version has not reached, if any. */
export function lowestUnmetFloor(tag: PolicyTag, current: string): string | null {
  const unmet = (tag.requires ?? []).filter((floor) => compareSemver(floor, current) > 0);
  if (unmet.length === 0) return null;
  return unmet.reduce((lowest, floor) => (compareSemver(floor, lowest) < 0 ? floor : lowest));
}

/**
 * Whether stepping back to `tag` would strand the settings. Only a declared
 * schema below the local one blocks; an undeclared schema (a release from
 * before the marker existed, a nightly, the git fallback) is treated as it
 * always was.
 */
export function isDowngradeBlocked(tag: PolicyTag, localSchema: number | null): boolean {
  return tag.schema !== undefined && localSchema !== null && tag.schema < localSchema;
}

/**
 * Turn the channel's newest release into the version to offer.
 *
 * Upward, the newest release wins unless it declares a floor the device has
 * not reached, in which case the floor is offered instead, and the floor's
 * own floor after that. Downward, the newest is offered unless its declared
 * schema is below the local one. `tags` is newest first; `lookupTag` finds
 * a floor that is no longer on the release page.
 */
export async function resolveInstallTarget<T extends PolicyTag>(
  current: string,
  localSchema: number | null,
  tags: readonly T[],
  lookupTag: (tag: string) => Promise<T | null>,
): Promise<InstallTargetResolution<T>> {
  const none: InstallTargetResolution<T> = {
    target: null,
    requiredStepFor: null,
    missingStep: null,
    blockedDowngrade: null,
  };
  const newest = tags[0];
  if (!newest) return none;

  const cmp = compareSemver(newest.version, current);
  if (cmp === 0) return { ...none, target: newest };
  if (cmp < 0) {
    if (isDowngradeBlocked(newest, localSchema)) return { ...none, blockedDowngrade: newest.version };
    return { ...none, target: newest };
  }

  let candidate = newest;
  let waiting: string | null = null;
  const seen = new Set<string>([candidate.version]);
  for (let hop = 0; hop < MAX_FLOOR_HOPS; hop++) {
    const floor = lowestUnmetFloor(candidate, current);
    if (floor === null) return { ...none, target: candidate, requiredStepFor: waiting };
    // A floor that names the release itself, or loops back, cannot be
    // satisfied by installing anything. Say so rather than offer it.
    if (seen.has(floor)) return { ...none, requiredStepFor: candidate.version, missingStep: floor };
    seen.add(floor);
    const found = tags.find((tag) => tag.version === floor) ?? (await lookupTag(`v${floor}`));
    if (!found) return { ...none, requiredStepFor: candidate.version, missingStep: floor };
    waiting = candidate.version;
    candidate = found;
  }
  return { ...none, requiredStepFor: candidate.version, missingStep: lowestUnmetFloor(candidate, current) };
}

/** Thrown by `assertUpgradePathAllowed`. Message is plain and user-facing. */
export class UpgradePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpgradePathError';
  }
}

export function requiredStepMessage(target: string, floor: string): string {
  return `v${target} needs v${floor} installed first. Update to v${floor}, then update again.`;
}

export function blockedDowngradeMessage(target: string): string {
  return `Going back to v${target} would leave settings that version cannot read.`;
}

/**
 * The server-side half of the policy: refuse an install the resolver would
 * not have offered, so the version history list and direct API calls cannot
 * skip a step or strand the settings.
 */
export function assertUpgradePathAllowed(
  current: string,
  localSchema: number | null,
  target: PolicyTag,
): void {
  const cmp = compareSemver(target.version, current);
  if (cmp > 0) {
    const floor = lowestUnmetFloor(target, current);
    if (floor !== null) throw new UpgradePathError(requiredStepMessage(target.version, floor));
  } else if (cmp < 0 && isDowngradeBlocked(target, localSchema)) {
    throw new UpgradePathError(blockedDowngradeMessage(target.version));
  }
}
