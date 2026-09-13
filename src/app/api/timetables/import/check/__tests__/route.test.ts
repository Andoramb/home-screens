import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () => {}),
  requireDisplayAuth: vi.fn(async () => {}),
}));

// Only the two calls that reach Google are stubbed. Link parsing and the CSV
// reading stay real, so the preview is the one the household would see.
vi.mock('@/lib/timetable-import', async () => {
  const actual = await vi.importActual<typeof import('@/lib/timetable-import')>('@/lib/timetable-import');
  return { ...actual, fetchSheetTabs: vi.fn(), fetchSheetCsv: vi.fn() };
});

import { POST } from '../route';
import { fetchSheetCsv, fetchSheetTabs } from '@/lib/timetable-import';

const tabs = vi.mocked(fetchSheetTabs);
const csv = vi.mocked(fetchSheetCsv);

const now = '2026-09-09T12:00:00.000Z';
const member = (id: string, name: string) => ({ id, name, color: '#60a5fa', createdAt: now, updatedAt: now });
const subject = (id: string, code: string, name: string) => ({ id, code, name, color: '#4f8ef7', icon: 'book' });

const SHEET = 'https://docs.google.com/spreadsheets/d/1abcDEF/edit#gid=123';
const SHEET_WITHOUT_TAB = 'https://docs.google.com/spreadsheets/d/1abcDEF/edit';

const GRID = [
  ',,Mo,Di,Mi,Do,Fr',
  '1,08:00 - 08:45,Ma,De,,Ma,De',
  'Pause,08:45 - 09:00,,,,,',
  '2,09:00 - 09:45,Sp / H1,,,,',
].join('\n');

let root: string;
const saved = { schools: [], subjects: [subject('ma', 'Ma', 'Mathe'), subject('deu', 'Deu', 'Deutsch')], timetables: [] };
const check = (body: unknown) => POST(new NextRequest('http://localhost/api/timetables/import/check', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), undefined);

beforeEach(async () => {
  vi.clearAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-timetable-import-route-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  const put = (file: string, data: unknown) => fs.writeFile(path.join(root, 'data', file), JSON.stringify(data, null, 2));
  await put('family.json', { members: [member('a', 'Leon'), member('b', 'Mia')], migrated: true });
  await put('timetables.json', saved);
  tabs.mockResolvedValue({ ok: true, tabs: [{ name: 'Leon 7c', gid: '0' }, { name: 'Mia', gid: '123' }] });
  csv.mockResolvedValue({ ok: true, text: GRID });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe('/api/timetables/import/check', () => {
  it('previews every tab and picks the person each one is named after', async () => {
    const response = await check({ url: SHEET });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({ ok: true, tabsListed: true });
    expect(body.tabs.map((tab: { gid: string; name: string; memberId?: string }) => [tab.gid, tab.name, tab.memberId]))
      .toEqual([['0', 'Leon 7c', 'a'], ['123', 'Mia', 'b']]);
    // A tab is downloaded by gid, never by name.
    expect(csv.mock.calls.map((call) => call[1])).toEqual(['0', '123']);
  });

  it('reads the week, the breaks and the rooms out of a tab', async () => {
    const body = await (await check({ url: SHEET })).json();
    const preview = body.tabs[0].preview;

    expect(preview.days).toEqual(['mon', 'tue', 'wed', 'thu', 'fri']);
    expect(preview.rows[0]).toMatchObject({ kind: 'period', n: 1, start: '08:00', end: '08:45' });
    expect(preview.rows[0].cells.mon).toMatchObject({ code: 'Ma', subjectId: 'ma' });
    expect(preview.rows[1]).toMatchObject({ kind: 'break', label: 'Pause', start: '08:45', end: '09:00' });
    expect(preview.rows[2].cells.mon).toMatchObject({ code: 'Sp', room: 'H1' });
  });

  it('names the codes the subject list does not have, busiest first, with what they look like', async () => {
    const body = await (await check({ url: SHEET })).json();

    expect(body.tabs[0].preview.unknownCodes).toEqual([
      // 'de' shares only two letters with 'deutsch', so it is offered but not taken.
      { code: 'De', count: 2, suggestion: { subjectId: 'deu', code: 'Deu', name: 'Deutsch', confident: false } },
      { code: 'Sp', count: 1 },
    ]);
  });

  // Not a failure: the household pastes one link per tab on the same screen,
  // so this outcome carries no message to show.
  it('says the sheet listed no tabs, without calling it a failure', async () => {
    tabs.mockResolvedValue({ ok: false, reason: 'no-tab-list' });
    const body = await (await check({ url: SHEET_WITHOUT_TAB })).json();

    expect(body).toEqual({ ok: true, tabsListed: false, tabs: [] });
    expect(body).not.toHaveProperty('messageKey');
    expect(csv).not.toHaveBeenCalled();
  });

  it('still reads the one tab a pasted link names when the sheet lists none', async () => {
    tabs.mockResolvedValue({ ok: false, reason: 'no-tab-list' });
    csv.mockResolvedValue({ ok: true, text: GRID, tabName: 'Mia' });
    const body = await (await check({ url: SHEET })).json();

    expect(body.tabsListed).toBe(false);
    expect(body.tabs).toHaveLength(1);
    expect(body.tabs[0]).toMatchObject({ gid: '123', name: 'Mia', memberId: 'b' });
    expect(csv).toHaveBeenCalledWith(expect.objectContaining({ spreadsheetId: '1abcDEF' }), '123');
  });

  it('reports a tab that will not download without hiding the others', async () => {
    csv.mockResolvedValueOnce({ ok: false, messageKey: 'tabNotFound' });
    const body = await (await check({ url: SHEET })).json();

    expect(body.tabs[0]).toMatchObject({ gid: '0', messageKey: 'tabNotFound' });
    expect(body.tabs[0].preview).toBeUndefined();
    expect(body.tabs[1].preview.rows.length).toBeGreaterThan(0);
  });

  it('hands back the reason the sheet could not be read', async () => {
    tabs.mockResolvedValue({ ok: false, reason: 'failed', messageKey: 'sheetNotShared' });
    const response = await check({ url: SHEET });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false, messageKey: 'sheetNotShared' });
  });

  it('refuses something that is not a Google Sheets link before fetching anything', async () => {
    const body = await (await check({ url: 'https://example.com/timetable.pdf' })).json();

    expect(body).toEqual({ ok: false, messageKey: 'linkNotUnderstood' });
    expect(tabs).not.toHaveBeenCalled();
  });

  it('asks for a link when none was sent', async () => {
    const response = await check({});
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('url');
  });

  // Applying an import is an ordinary save from the editor, so a check on its
  // own must leave the saved timetables exactly as they were.
  it('never writes', async () => {
    await check({ url: SHEET });
    const after = JSON.parse(await fs.readFile(path.join(root, 'data', 'timetables.json'), 'utf-8'));
    expect(after).toEqual(saved);
  });
});

describe('/api/timetables/import/check, names written without their umlauts', () => {
  it('matches a tab that spells a name the way a keyboard without umlauts does', async () => {
    // A sheet is named by whoever made it, and a school typing Joerg rather than
    // Jörg is the ordinary case. Dropping the accent alone gives "jorg", which
    // matches neither spelling, so nobody was suggested and the editor asked.
    await fs.writeFile(
      path.join(root, 'data', 'family.json'),
      JSON.stringify({ members: [member('a', 'Jörg'), member('b', 'Müller Mia')], migrated: true }),
    );
    tabs.mockResolvedValue({ ok: true, tabs: [{ name: 'Joerg 7c', gid: '0' }, { name: 'Mueller Mia', gid: '1' }] });

    const body = await (await check({ url: SHEET })).json();

    expect(body.tabs.map((tab: { gid: string; memberId?: string }) => [tab.gid, tab.memberId]))
      .toEqual([['0', 'a'], ['1', 'b']]);
  });

  it('still matches a name spelt with its umlaut', async () => {
    await fs.writeFile(
      path.join(root, 'data', 'family.json'),
      JSON.stringify({ members: [member('a', 'Jörg')], migrated: true }),
    );
    tabs.mockResolvedValue({ ok: true, tabs: [{ name: 'Jörg', gid: '0' }] });

    const body = await (await check({ url: SHEET })).json();

    expect(body.tabs[0].memberId).toBe('a');
  });
});
