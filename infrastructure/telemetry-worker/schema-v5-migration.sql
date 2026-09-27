-- Add the rollup the daily clean-up writes before deleting installs that
-- have been silent for 12 months. Run once against the existing database,
-- BEFORE deploying the Worker that carries the cron:
--
--   npx wrangler d1 execute telemetry --remote --file=schema-v5-migration.sql
--
-- Safe to re-run. If the Worker is deployed first, the clean-up fails
-- without deleting anything (the rollup and the delete run as one batch),
-- so nothing is lost; it just waits for this table.

CREATE TABLE IF NOT EXISTS pruned_installs (
  first_seen_day  TEXT PRIMARY KEY,  -- YYYY-MM-DD
  installs        INTEGER NOT NULL
);
