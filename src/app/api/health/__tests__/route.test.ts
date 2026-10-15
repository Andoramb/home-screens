/**
 * Route-level tests for `GET /api/health`.
 *
 * The route is the probe the upgrade pipeline and the display-only launcher
 * use to decide whether the hub is up, so the contract that matters is: it
 * answers 200 with the version whenever the process serves it, and it never
 * turns a missing file into an error.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const readBuildIdMock = vi.fn();
const getPackageVersionMock = vi.fn();

vi.mock('@/lib/build-id', () => ({ readBuildId: readBuildIdMock }));
vi.mock('@/lib/version', () => ({ getPackageVersion: getPackageVersionMock }));
vi.mock('@/lib/migrations', () => ({ getLatestSchemaVersion: () => 7 }));

async function loadRoute() {
  vi.resetModules();
  return import('../route');
}

describe('GET /api/health', () => {
  beforeEach(() => {
    readBuildIdMock.mockReset();
    getPackageVersionMock.mockReset();
  });

  it('answers 200 with the version, build, schema and uptime, uncached', async () => {
    readBuildIdMock.mockResolvedValue('abc123');
    getPackageVersionMock.mockResolvedValue('1.13.0');
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, version: '1.13.0', build: 'abc123', schema: 7 });
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('still answers 200 when package.json cannot be read', async () => {
    readBuildIdMock.mockResolvedValue('unknown');
    getPackageVersionMock.mockRejectedValue(new Error('ENOENT'));
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, version: 'unknown', build: 'unknown' });
  });

  it('carries nothing about the household', async () => {
    readBuildIdMock.mockResolvedValue('abc123');
    getPackageVersionMock.mockResolvedValue('1.13.0');
    const { GET } = await loadRoute();
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(['build', 'ok', 'schema', 'uptime', 'version']);
  });
});
