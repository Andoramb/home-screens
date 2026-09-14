import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Route-level tests for POST /api/backgrounds/move: body validation and the
 * mapping of `LibraryMoveError` onto HTTP statuses. The move itself is
 * covered by `src/lib/__tests__/library-moves.test.ts` on a real temp library.
 */
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

vi.mock('@/lib/library-moves', () => ({
  moveLibraryFiles: vi.fn(),
  LibraryMoveError: class LibraryMoveError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
}));

import { LibraryMoveError, moveLibraryFiles } from '@/lib/library-moves';
import { POST } from '../route';

const move = vi.mocked(moveLibraryFiles);

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/backgrounds/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => move.mockReset());

describe('POST /api/backgrounds/move', () => {
  it('passes files and directory through and returns the move result', async () => {
    move.mockResolvedValueOnce({ moved: [{ from: 'a.jpg', to: 'trips/a.jpg' }], rewritten: 1, revision: 'r1' });
    const res = await POST(request({ files: ['a.jpg'], directory: 'trips' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ moved: [{ from: 'a.jpg', to: 'trips/a.jpg' }], rewritten: 1, revision: 'r1' });
    expect(move).toHaveBeenCalledWith(['a.jpg'], 'trips');
  });

  it('rejects a missing or empty file list and a missing directory', async () => {
    expect((await POST(request({ directory: 'trips' }))).status).toBe(400);
    expect((await POST(request({ files: [], directory: 'trips' }))).status).toBe(400);
    expect((await POST(request({ files: [1], directory: 'trips' }))).status).toBe(400);
    expect((await POST(request({ files: ['a.jpg'] }))).status).toBe(400);
    expect(move).not.toHaveBeenCalled();
  });

  it('maps a refusal onto its status and message', async () => {
    move.mockRejectedValueOnce(new LibraryMoveError('a.jpg is already in that folder', 409));
    const res = await POST(request({ files: ['a.jpg'], directory: 'trips' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('a.jpg is already in that folder');
  });

  it('answers 500 with the generic message on an unexpected error', async () => {
    move.mockRejectedValueOnce(new Error('disk on fire'));
    const res = await POST(request({ files: ['a.jpg'], directory: 'trips' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to move files');
  });
});
