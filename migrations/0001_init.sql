-- D1 schema for Name Vitals.
--
-- Sizing target: ~100k rows in `names`, ~1.9M rows in `name_years`, ~290 in
-- `year_totals`. Comfortably under D1's 10GB limit; long-form layout keeps
-- the prefix-autocomplete index push-downable.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS names (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  name_lower    TEXT    NOT NULL,
  sex           TEXT    NOT NULL CHECK (sex IN ('M','F')),
  first_year    INTEGER NOT NULL,
  last_year     INTEGER NOT NULL,
  peak_year     INTEGER NOT NULL,
  peak_count    INTEGER NOT NULL,
  total_count   INTEGER NOT NULL,
  status        TEXT    NOT NULL,
  decline_pct   REAL,
  latest_count  INTEGER NOT NULL DEFAULT 0,
  prev_decade   INTEGER,
  curr_decade   INTEGER,
  growth_x      REAL,
  spark_blob    BLOB,
  UNIQUE(name, sex)
);

CREATE INDEX IF NOT EXISTS names_lower_peak  ON names(name_lower, peak_count DESC);
CREATE INDEX IF NOT EXISTS names_status_peak ON names(status, peak_count DESC);
CREATE INDEX IF NOT EXISTS names_status_curr ON names(status, curr_decade DESC);

CREATE TABLE IF NOT EXISTS name_years (
  name_id INTEGER NOT NULL REFERENCES names(id) ON DELETE CASCADE,
  year    INTEGER NOT NULL,
  count   INTEGER NOT NULL,
  PRIMARY KEY (name_id, year)
);

CREATE INDEX IF NOT EXISTS name_years_year_count ON name_years(year, count DESC);

CREATE TABLE IF NOT EXISTS year_totals (
  year  INTEGER NOT NULL,
  sex   TEXT    NOT NULL CHECK (sex IN ('M','F')),
  total INTEGER NOT NULL,
  PRIMARY KEY (year, sex)
);

-- Singleton key/value: min_year, max_year, total_names, total_rows,
-- last_ingest_at, last_ssa_etag, schema_version, data_version.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Staging mirrors of `names` and `name_years`. Ingest writes here, then a
-- single transaction renames staging → live so reads never see a partial
-- ingest. Indexes match the live tables but are dropped during bulk insert
-- and recreated at finalize-time.
CREATE TABLE IF NOT EXISTS names_staging (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  name_lower    TEXT    NOT NULL,
  sex           TEXT    NOT NULL CHECK (sex IN ('M','F')),
  first_year    INTEGER NOT NULL,
  last_year     INTEGER NOT NULL,
  peak_year     INTEGER NOT NULL,
  peak_count    INTEGER NOT NULL,
  total_count   INTEGER NOT NULL,
  status        TEXT    NOT NULL,
  decline_pct   REAL,
  latest_count  INTEGER NOT NULL DEFAULT 0,
  prev_decade   INTEGER,
  curr_decade   INTEGER,
  growth_x      REAL,
  spark_blob    BLOB,
  UNIQUE(name, sex)
);

CREATE TABLE IF NOT EXISTS name_years_staging (
  name_id INTEGER NOT NULL,
  year    INTEGER NOT NULL,
  count   INTEGER NOT NULL,
  PRIMARY KEY (name_id, year)
);
