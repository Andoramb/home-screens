import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(), requireDisplayAuth: vi.fn(), isAuthEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock('@/lib/family-data', () => ({ readFamilyData: vi.fn(), settleFamilyMigration: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/data-transaction', () => ({
  durableRemove: async (file: string) => {
    const { promises: fs } = await import('fs');
    await fs.rm(file, { force: true });
  },
  withDataTransaction: (operation: () => Promise<unknown>) => operation(),
  onDataTransactionCommit: vi.fn(),
}));
vi.mock('@/lib/reward-data', () => ({ readRewardData: vi.fn(), updateRewardDefinitions: vi.fn(), creditPoints: vi.fn(), debitPoints: vi.fn() }));

import { POST, PUT } from '../route';
import { readFamilyData } from '@/lib/family-data';
import { readRewardData, updateRewardDefinitions, creditPoints, debitPoints } from '@/lib/reward-data';
import { contentRevision } from '@/lib/content-revision';

const reward = { id: 'r1', name: 'Movie', emoji: '', description: '', cost: 2, memberIds: ['m1'], enabled: true };
const data = { rewards: [reward], balances: { m1: 5 }, redemptions: [] };
const request = (method: string, body: unknown) => new NextRequest('http://localhost/api/rewards/data', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFamilyData).mockResolvedValue({ members: [{ id: 'm1', name: 'Alex', color: '#aabbcc', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }] });
  vi.mocked(readRewardData).mockResolvedValue(data);
  vi.mocked(updateRewardDefinitions).mockResolvedValue(data);
  vi.mocked(creditPoints).mockResolvedValue(data);
  vi.mocked(debitPoints).mockResolvedValue(data);
});

/** The revision a client that loaded the current mock would quote. */
const revision = contentRevision(data.rewards);

describe('/api/rewards/data family references', () => {
  it('saves reward assignments to current family members', async () => {
    const res = await PUT(request('PUT', { rewards: [reward], revision }));
    expect(res.status).toBe(200);
    expect(updateRewardDefinitions).toHaveBeenCalledWith([reward]);
    expect((await res.json()).revision).toBe(contentRevision(data.rewards));
  });

  it('rejects a stale reward assignment without changing definitions', async () => {
    expect((await PUT(request('PUT', { rewards: [{ ...reward, memberIds: ['deleted'] }], revision }))).status).toBe(409);
    expect(updateRewardDefinitions).not.toHaveBeenCalled();
  });

  // Removing a person rewrites rewards.json, so a page still naming them is
  // holding an old list and needs the current one back, not a bare refusal.
  it('hands a page holding an old reward list the current one, even when it names a removed person', async () => {
    const held = [{ ...reward, memberIds: ['m1', 'deleted'] }];
    const res = await PUT(request('PUT', { rewards: held, revision: contentRevision(held) }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'revision', rewards: data.rewards, revision });
    expect(updateRewardDefinitions).not.toHaveBeenCalled();
  });

  it('rejects malformed member lists before a store write', async () => {
    expect((await PUT(request('PUT', { rewards: [{ ...reward, memberIds: 'm1' }], revision }))).status).toBe(400);
    expect(updateRewardDefinitions).not.toHaveBeenCalled();
  });

  it.each([4, -4])('adjusts an existing member balance by %s', async (amount) => {
    expect((await POST(request('POST', { memberId: 'm1', amount }))).status).toBe(200);
    expect(amount > 0 ? creditPoints : debitPoints).toHaveBeenCalledWith('m1', 4);
  });

  it('refuses a write that quotes no revision', async () => {
    expect((await PUT(request('PUT', { rewards: [reward] }))).status).toBe(400);
    expect(updateRewardDefinitions).not.toHaveBeenCalled();
  });

  /* Two phones both loaded [reward]; the second to save must not drop what
   * the first added. */
  it('answers a write built from an older copy with 409 and the current list', async () => {
    const res = await PUT(request('PUT', { rewards: [], force: true, revision: contentRevision([]) }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.reason).toBe('revision');
    expect(json.rewards).toEqual(data.rewards);
    expect(json.revision).toBe(revision);
    expect(updateRewardDefinitions).not.toHaveBeenCalled();
  });

  it('cannot recreate a removed member balance', async () => {
    expect((await POST(request('POST', { memberId: 'deleted', amount: 4 }))).status).toBe(409);
    expect(creditPoints).not.toHaveBeenCalled();
    expect(debitPoints).not.toHaveBeenCalled();
  });
});
