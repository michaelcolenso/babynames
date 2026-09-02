-- Pre-computed per-state rankings, derived from name_states (migration 0010).
-- State hubs (/state/:state/) rank names within a (state, year, sex); doing
-- that with a window function at request time would scan ~57k name_states
-- rows per hit. This table stores the answer so the hub reads only the rows
-- it returns — the same contract as name_rankings_by_year (migration 0022).
--
-- Compound PK (state, year, sex, rank) makes
-- `WHERE state = ? AND year = ? AND rank <= ?` a direct index range scan.
--
-- Only the top STATE_RANKINGS_PER_SEX_LIMIT (packages/shared/src/state-rankings.ts)
-- ranks per (state, year, sex) are stored; readers needing deeper ranks fall
-- back to the live window-function query over name_states.
--
-- Populated by `npm run backfill-state-rankings`, and rebuilt at the end of
-- every state ingest (diaspora-finalize in apps/ingest-worker/src/index.ts).
CREATE TABLE IF NOT EXISTS state_year_rankings (
  state TEXT NOT NULL,
  year  INTEGER NOT NULL,
  sex   TEXT NOT NULL CHECK (sex IN ('M','F')),
  rank  INTEGER NOT NULL,
  name  TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (state, year, sex, rank)
);

-- Per-(state, year) context for the hub pages: how many births the SSA state
-- file records and how many names crossed its 5-birth floor. Computing these
-- at request time is a full name_states scan (~6.6M rows), so they are
-- precomputed alongside the rankings.
CREATE TABLE IF NOT EXISTS state_year_totals (
  state  TEXT NOT NULL,
  year   INTEGER NOT NULL,
  births INTEGER NOT NULL,
  names  INTEGER NOT NULL,
  PRIMARY KEY (state, year)
);

-- The hub's "distinctively local" section joins state ranks against the
-- national rank for the same (name, sex, year); that join reads
-- name_rankings_by_year, which already has a rank-leading covering index.
-- No additional index is needed here: all request-time reads key on the PK.
