-- Precomputed per-name geographic diffusion summary, read by the API + SSR.
-- One row per (name, sex), keyed on name_lower to mirror the enrichment
-- tables. `name_diaspora_staging` is the write target for the compute chain;
-- a single-transaction rename swaps it onto live (zero-downtime, like the
-- national names swap).
CREATE TABLE IF NOT EXISTS name_diaspora (
  name               TEXT NOT NULL,
  name_lower         TEXT NOT NULL,
  sex                TEXT NOT NULL CHECK (sex IN ('M','F')),
  origin_state       TEXT,            -- NULL when the name never crossed the threshold
  origin_year        INTEGER,
  peak_national_year INTEGER,
  spread_json        TEXT NOT NULL,   -- JSON array of {state, year, count} in adoption order
  never_adopted      TEXT NOT NULL,   -- JSON array of state abbreviations
  total_states       INTEGER NOT NULL,
  diffusion_years    INTEGER NOT NULL,
  PRIMARY KEY (name_lower, sex)
);

CREATE TABLE IF NOT EXISTS name_diaspora_staging (
  name               TEXT NOT NULL,
  name_lower         TEXT NOT NULL,
  sex                TEXT NOT NULL CHECK (sex IN ('M','F')),
  origin_state       TEXT,
  origin_year        INTEGER,
  peak_national_year INTEGER,
  spread_json        TEXT NOT NULL,
  never_adopted      TEXT NOT NULL,
  total_states       INTEGER NOT NULL,
  diffusion_years    INTEGER NOT NULL,
  PRIMARY KEY (name_lower, sex)
);
