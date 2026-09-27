import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker';

// The daily clean-up runs its real SQL against real SQLite (D1 is SQLite),
// built from the real schema, and the dashboard's own queries are read from
// grafana-dashboard.json, so what is under test is what ships.

const SCHEMA = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

const DASHBOARD = JSON.parse(readFileSync(path.join(__dirname, 'grafana-dashboard.json'), 'utf8')) as {
  panels: Array<{ title: string; targets?: Array<{ url_options?: { data?: string } }> }>;
};

function panelSql(title: string): string {
  const panel = DASHBOARD.panels.find((p) => p.title === title);
  return JSON.parse(panel!.targets![0].url_options!.data!).sql;
}

type Bound = ReturnType<ReturnType<typeof d1>['prepare']>;

/** The slice of D1 the scheduled handler uses, backed by node:sqlite. */
function d1(db: DatabaseSync) {
  const statement = (sql: string, args: Array<string | number | null> = []) => ({
    bind: (...next: Array<string | number | null>) => statement(sql, next),
    first: async <T>() => (db.prepare(sql).get(...args) as T | undefined) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return {
    prepare: (sql: string) => statement(sql),
    /** D1 runs a batch as one transaction: all of it or none of it. */
    batch: async (statements: Bound[]) => {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return db;
}

/** first/last seen as SQLite datetime modifiers relative to now. */
function addInstall(db: DatabaseSync, id: string, firstSeen: string, lastSeen: string) {
  db.prepare("INSERT INTO beacons (install_id, first_seen_at, last_seen_at) VALUES (?, datetime('now', ?), datetime('now', ?))")
    .run(id, firstSeen, lastSeen);
}

function installsIn(db: DatabaseSync): string[] {
  return (db.prepare('SELECT install_id FROM beacons ORDER BY install_id').all() as Array<{ install_id: string }>)
    .map((row) => row.install_id);
}

function prunedCounts(db: DatabaseSync): Record<string, number> {
  const rows = db.prepare('SELECT first_seen_day, installs FROM pruned_installs').all() as Array<{ first_seen_day: string; installs: number }>;
  return Object.fromEntries(rows.map((r) => [r.first_seen_day, r.installs]));
}

function dayOf(db: DatabaseSync, modifier: string): string {
  return (db.prepare("SELECT date('now', ?) AS d").get(modifier) as { d: string }).d;
}

const runCleanUp = (db: DatabaseSync) => worker.scheduled(undefined, { DB: d1(db) } as never);

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('telemetry daily clean-up', () => {
  it('deletes installs silent for more than 12 months, and nothing else', async () => {
    const db = freshDb();
    addInstall(db, 'a-reported-today', '-2 years', '+0 days');
    addInstall(db, 'b-quiet-11-months', '-2 years', '-11 months');
    addInstall(db, 'c-quiet-a-day-short-of-12-months', '-2 years', '+1 day');
    db.prepare("UPDATE beacons SET last_seen_at = datetime('now', '-12 months', '+1 day') WHERE install_id = ?").run('c-quiet-a-day-short-of-12-months');
    addInstall(db, 'd-quiet-a-day-past-12-months', '-2 years', '+0 days');
    db.prepare("UPDATE beacons SET last_seen_at = datetime('now', '-12 months', '-1 day') WHERE install_id = ?").run('d-quiet-a-day-past-12-months');
    addInstall(db, 'e-quiet-3-years', '-4 years', '-3 years');

    await runCleanUp(db);

    expect(installsIn(db)).toEqual(['a-reported-today', 'b-quiet-11-months', 'c-quiet-a-day-short-of-12-months']);
    expect(console.log).toHaveBeenCalledWith('Deleted 2 installs silent for 12 months (kept in pruned_installs totals)');
  });

  it('counts each deleted install under the day it was first seen', async () => {
    const db = freshDb();
    addInstall(db, 'old-1', '-3 years', '-2 years');
    addInstall(db, 'old-2', '-3 years', '-18 months');
    addInstall(db, 'old-3', '-30 months', '-13 months');
    addInstall(db, 'still-here', '-3 years', '-1 day');

    await runCleanUp(db);

    expect(prunedCounts(db)).toEqual({ [dayOf(db, '-3 years')]: 2, [dayOf(db, '-30 months')]: 1 });
  });

  it("keeps every dashboard total exactly the same across a clean-up", async () => {
    const db = freshDb();
    addInstall(db, 'i1', '-3 years', '-2 years');
    addInstall(db, 'i2', '-3 years', '-1 day');
    addInstall(db, 'i3', '-30 months', '-13 months');
    addInstall(db, 'i4', '-30 months', '-30 months');
    addInstall(db, 'i5', '-6 months', '-2 days');
    addInstall(db, 'i6', '-10 days', '+0 days');
    const totals = () => ({
      total: db.prepare(panelSql('Total installs')).all(),
      perDay: db.prepare(panelSql('New installs per day')).all(),
      cumulative: db.prepare(panelSql('Cumulative installs')).all(),
    });
    const before = totals();

    await runCleanUp(db);

    expect(installsIn(db)).toEqual(['i2', 'i5', 'i6']);
    expect(totals()).toEqual(before);
    expect(before.total).toEqual([{ total: 6 }]);
  });

  it('adds up across days when more installs from the same first-seen day go quiet', async () => {
    const db = freshDb();
    addInstall(db, 'first', '-3 years', '-2 years');
    await runCleanUp(db);
    addInstall(db, 'second', '-3 years', '-13 months');
    await runCleanUp(db);

    expect(prunedCounts(db)).toEqual({ [dayOf(db, '-3 years')]: 2 });
  });

  it('deletes nothing when the rollup table is missing (the migration was not run yet)', async () => {
    const db = freshDb();
    db.exec('DROP TABLE pruned_installs');
    addInstall(db, 'quiet', '-3 years', '-2 years');

    await expect(runCleanUp(db)).rejects.toThrow(/pruned_installs/);
    expect(installsIn(db)).toEqual(['quiet']);
  });
});
