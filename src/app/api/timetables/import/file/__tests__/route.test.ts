import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

// The reading has its own tests. What this route owes is the plumbing: who may
// call it, what it refuses, and that it does not take a file the size of a
// music library.
const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/timetable-api', () => ({ readTimetableFiles: (...args: unknown[]) => state.read(...args) }));

import { POST } from '../route';

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/timetables/import/file', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.read.mockReset();
  state.read.mockResolvedValue({ ok: true, tabsListed: true, tabs: [] });
});

describe('POST /api/timetables/import/file', () => {
  it('reads the files it was handed', async () => {
    const files = [{ name: 'Taylor.csv', text: 'Period,Time,Monday' }];
    const res = await POST(post({ files }));

    expect(res.status).toBe(200);
    expect(state.read).toHaveBeenCalledWith(files);
  });

  it('refuses a request with no files, and one whose file has no text', async () => {
    for (const body of [{}, { files: [] }, { files: 'no' }, { files: [{ name: 'a.csv' }] }]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
    }
    expect(state.read).not.toHaveBeenCalled();
  });

  it('takes only as many files as a household could plausibly have children', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `${i}.csv`, text: 'Period,Time,Monday' }));
    await POST(post({ files: many }));
    expect(state.read.mock.calls[0][0]).toHaveLength(16);
  });
});
