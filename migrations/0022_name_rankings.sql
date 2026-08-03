-- Pre-computed per-year rankings. The top-N-per-(year, sex) queries used by
-- /api/meta, /api/year/:year and the river viz previously ranked every name
-- record for a year at request time (~137k rows read per hit). This table
-- stores the answer so those endpoints read only the rows they return.
--
-- Compound PK (year, sex, rank) makes `WHERE year = ? AND rank <= ?` a direct
-- index range scan.
--
-- Only the top RANKINGS_PER_SEX_LIMIT (packages/shared/src/rankings.ts) ranks
-- per (year, sex) are stored — storing all ~1.9M name_years rows would double
-- the database for ranks nothing queries. Callers asking for more than the cap
-- fall back to the live window-function query.
--
-- Populated by `npm run backfill-rankings` for existing data, and rebuilt at
-- the end of every ingest finalize (apps/ingest-worker/src/compute.ts).
CREATE TABLE IF NOT EXISTS name_rankings_by_year (
  year  INTEGER NOT NULL,
  sex   TEXT NOT NULL CHECK (sex IN ('M','F')),
  rank  INTEGER NOT NULL,
  name  TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (year, sex, rank)
);

-- /api/meta reads the top 10 for *every* year, which filters on rank without a
-- year. Rank-leading covering index so that read touches only the ~2 * 10 rows
-- per year it returns instead of scanning the whole table.
CREATE INDEX IF NOT EXISTS name_rankings_rank
  ON name_rankings_by_year(rank, year, sex, name, count);
