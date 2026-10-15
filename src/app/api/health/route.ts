import { NextResponse } from 'next/server';
import { readBuildId } from '@/lib/build-id';
import { getPackageVersion } from '@/lib/version';
import { getLatestSchemaVersion } from '@/lib/migrations';

export const dynamic = 'force-dynamic';

/** What `GET /api/health` answers. */
export interface HealthResponse {
  ok: true;
  /** The release this hub runs, from package.json. */
  version: string;
  /** The Next.js build id, the same string `/api/system/build-id` serves. */
  build: string;
  /** The newest config schema this release reads. */
  schema: number;
  /** Seconds since the server process started. */
  uptime: number;
}

/**
 * GET /api/health: is the hub up, and what is it running.
 *
 * Intentionally public (no auth) and exempt from the IP allowlist in
 * src/proxy.ts: the upgrade pipeline probes it from the Pi itself to decide
 * whether a new release booted, the display-only launcher probes it to decide
 * whether to show the connecting splash, and a support thread asks for it
 * first. It says nothing about the household: no hostname, no displays, no
 * settings, only the version, the build, the schema and the uptime.
 *
 * A 200 means the app booted and is routing requests. The reads below never
 * throw, so a hub that serves this route at all answers 200; a release that
 * must not run on the data it finds has to exit rather than serve errors.
 */
export async function GET() {
  const [version, build] = await Promise.all([
    getPackageVersion().catch(() => 'unknown'),
    readBuildId(),
  ]);
  const body: HealthResponse = {
    ok: true,
    version,
    build,
    schema: getLatestSchemaVersion(),
    uptime: Math.round(process.uptime()),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
