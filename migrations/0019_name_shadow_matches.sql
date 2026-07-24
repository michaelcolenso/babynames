-- Precomputed "shadow name" matches for /shadow/:name/:year/ (The
-- Counterfactual You). One row per (name_lower, sex) currently linked from
-- every /name/:name/ page, for the single birth year that link ever uses
-- (the dataset's current max year). Computed offline by
-- scripts/build-shadow-matches.ts; `name_shadow_matches_staging` is the
-- write target, swapped onto live the same way name_diaspora is.
--
-- This replaces a live query that ordered by ABS(count - target) — an
-- unindexable computed expression that forced a full table scan + sort on
-- every request and had no error handling, which is what caused a spike in
-- GSC-reported 5xx errors (these pages are linked from every name page but
-- not in the sitemap, so Googlebot discovers and crawls all of them).
CREATE TABLE IF NOT EXISTS name_shadow_matches (
  name              TEXT NOT NULL,
  name_lower        TEXT NOT NULL,
  sex               TEXT NOT NULL CHECK (sex IN ('M','F')),
  year              INTEGER NOT NULL,
  input_count       INTEGER NOT NULL,
  shadow_name       TEXT NOT NULL,
  shadow_name_lower TEXT NOT NULL,
  shadow_sex        TEXT NOT NULL CHECK (shadow_sex IN ('M','F')),
  shadow_count      INTEGER NOT NULL,
  diff              INTEGER NOT NULL,
  PRIMARY KEY (name_lower, sex)
);

CREATE TABLE IF NOT EXISTS name_shadow_matches_staging (
  name              TEXT NOT NULL,
  name_lower        TEXT NOT NULL,
  sex               TEXT NOT NULL CHECK (sex IN ('M','F')),
  year              INTEGER NOT NULL,
  input_count       INTEGER NOT NULL,
  shadow_name       TEXT NOT NULL,
  shadow_name_lower TEXT NOT NULL,
  shadow_sex        TEXT NOT NULL CHECK (shadow_sex IN ('M','F')),
  shadow_count      INTEGER NOT NULL,
  diff              INTEGER NOT NULL,
  PRIMARY KEY (name_lower, sex)
);
