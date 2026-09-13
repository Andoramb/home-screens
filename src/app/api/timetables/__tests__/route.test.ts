import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

import { GET, PUT } from '../route';
import { readTimetables } from '@/lib/timetable-data';

const now = '2026-09-09T12:00:00.000Z';
const member = (id: string, name = id) => ({ id, name, color: '#60a5fa', createdAt: now, updatedAt: now });

const school = {
  id: 's1',
  name: 'Grundschule',
  slots: [
    { kind: 'period', n: 1, start: '08:00', end: '08:45' },
    { kind: 'break', label: 'Pause', start: '08:45', end: '09:00' },
    { kind: 'period', n: 2, start: '09:00', end: '09:45' },
  ],
  weekCycle: { mode: 'off' },
  specialDays: [],
};
const subject = { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'calculator' };
const week = { A: { mon: { 1: { subjectId: 'ma' } } } };
const document = (memberId = 'a') => ({
  schools: [school],
  subjects: [subject],
  timetables: [{ memberId, schoolId: 's1', className: '3b', weeks: week }],
});

let root: string;
const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data, null, 2));
const saved = async () => JSON.parse(await fs.readFile(path.join(root, 'data', 'timetables.json'), 'utf-8'));
const get = () => GET(new NextRequest('http://localhost/api/timetables'), undefined);
const save = (body: unknown) => PUT(new NextRequest('http://localhost/api/timetables', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), undefined);
const revisionNow = async () => (await get()).json().then((body) => body.revision as string);

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-timetables-route-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await put('family.json', { members: [member('a', 'Leon'), member('b', 'Mia')], migrated: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('/api/timetables', () => {
  it('serves the document with the revision a save has to quote back', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.timetables).toEqual([]);
    // A household that has never saved is handed the starter subject list.
    expect(body.data.subjects.length).toBeGreaterThan(0);
    expect(body.revision).toBe((await readTimetables()).revision);
  });

  it('saves a checked change and answers with the document and its new revision', async () => {
    const revision = await revisionNow();
    const response = await save({ data: document(), revision });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.timetables[0]).toMatchObject({ memberId: 'a', schoolId: 's1', className: '3b' });
    expect(body.revision).not.toBe(revision);
    expect((await saved()).timetables).toHaveLength(1);
  });

  // The editor reads `data` and `revision` straight off the conflict to offer
  // a reload; a bare { error } would leave it saving against a copy that is
  // already gone.
  it('returns the saved document alongside a stale-revision conflict', async () => {
    await save({ data: document(), revision: await revisionNow() });
    const response = await save({ data: document('b'), revision: 'stale' });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('Somebody else changed the timetables');
    expect(body.data.timetables[0].memberId).toBe('a');
    expect(body.revision).toBe((await readTimetables()).revision);
    expect((await saved()).timetables[0].memberId).toBe('a');
  });

  it('refuses a save that quotes no revision', async () => {
    const response = await save({ data: document() });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('Reopen the timetables page');
    await expect(saved()).rejects.toThrow();
  });

  it('refuses a timetable for somebody who is not in the family', async () => {
    const response = await save({ data: document('nobody'), revision: await revisionNow() });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('no longer in the family');
    await expect(saved()).rejects.toThrow();
  });

  it('refuses a document the store could not serve back, with its own reason', async () => {
    const broken = document();
    broken.subjects = [{ ...subject, color: 'blue' }];
    const response = await save({ data: broken, revision: await revisionNow() });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('needs a colour');
    await expect(saved()).rejects.toThrow();
  });

  it('refuses a body that is not an object', async () => {
    const response = await save('everything');
    expect(response.status).toBe(400);
  });
});
