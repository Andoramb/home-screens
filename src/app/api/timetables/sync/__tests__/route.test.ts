import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

// The check itself has its own tests. What this route owes is the plumbing:
// who may call it, what it refuses, and that it names the right person.
vi.mock('@/lib/timetable-sync', () => ({ syncDueSheets: vi.fn(async () => 1) }));

import { POST } from '../route';
import { syncDueSheets } from '@/lib/timetable-sync';

const sync = vi.mocked(syncDueSheets);

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/timetables/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  sync.mockClear();
});

describe('POST /api/timetables/sync', () => {
  it('checks the sheet of the person it was given', async () => {
    const res = await POST(post({ memberId: 'leon' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 1 });
    expect(sync).toHaveBeenCalledWith({ force: 'leon' });
  });

  it('trims the name it was given rather than looking for a person with spaces', async () => {
    await POST(post({ memberId: '  leon  ' }));
    expect(sync).toHaveBeenCalledWith({ force: 'leon' });
  });

  it('refuses a request that names nobody', async () => {
    for (const body of [{}, { memberId: '' }, { memberId: '   ' }, { memberId: 7 }]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect(sync).not.toHaveBeenCalled();
    }
  });

  it('answers rather than throwing when the sheet could not be read', async () => {
    // The check swallows its own failures and reports how many it looked at, so
    // a sheet nobody could reach is an ordinary answer with nothing changed.
    sync.mockResolvedValueOnce(0);
    const res = await POST(post({ memberId: 'leon' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 0 });
  });
});
