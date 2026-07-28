-- Rare-name story metrics and editorial collection membership.
--
-- Both tables are precomputed offline by scripts/build-name-facts.ts and applied
-- by scripts/seed-name-facts.ts. The ingest worker never writes them.
--
-- Why not columns on `names`: rarity rank needs a global sort across the whole
-- corpus, and the geography fields need name_states (~6M rows, refreshed on a
-- separate cadence). compute.ts finalize() is a 200-name streaming pager and can
-- see neither. This follows the same offline-build pattern already used by
-- name_enrichment_profiles, name_shadow_matches, and name_diaspora.
--
-- Staleness is tracked via meta.facts_version, which records the data_version
-- that was live when the facts were built. Renderers do NOT gate on a match
-- (that would blank every name page after an ingest); scripts/verify-name-facts.ts
-- exits non-zero on drift instead.

CREATE TABLE IF NOT EXISTS name_facts (
  name_lower          TEXT    NOT NULL,
  sex                 TEXT    NOT NULL CHECK (sex IN ('M','F')),
  name                TEXT    NOT NULL,   -- display casing

  -- Carried from `names` so a collection predicate is a pure function of one row.
  total_count         INTEGER NOT NULL,
  peak_year           INTEGER NOT NULL,
  peak_count          INTEGER NOT NULL,
  latest_count        INTEGER NOT NULL,
  status              TEXT    NOT NULL,

  -- Rarity. rarity_pct_sex is 0-100 where 100 is the rarest within the sex.
  rarity_rank_sex     INTEGER NOT NULL,
  rarity_total_sex    INTEGER NOT NULL,
  rarity_pct_sex      REAL    NOT NULL,
  rarity_rank_all     INTEGER NOT NULL,
  rarity_band         TEXT    NOT NULL CHECK (rarity_band IN
                        ('ultra-rare','very-rare','rare','uncommon','common','ubiquitous')),

  -- Lifecycle.
  first_year          INTEGER NOT NULL,
  last_year           INTEGER NOT NULL,
  years_recorded      INTEGER NOT NULL,   -- years with any recorded births
  span_years          INTEGER NOT NULL,   -- last_year - first_year + 1
  max_annual          INTEGER NOT NULL,   -- best single year
  gap_years_max       INTEGER NOT NULL,   -- longest dormancy inside the span
  gap_start_year      INTEGER,
  gap_end_year        INTEGER,
  is_one_and_done     INTEGER NOT NULL DEFAULT 0,
  is_sub_ten          INTEGER NOT NULL DEFAULT 0,
  is_verge            INTEGER NOT NULL DEFAULT 0,

  -- One dramatic year measured against the name's own recent baseline.
  spike_year          INTEGER,
  spike_ratio         REAL,
  spike_baseline      INTEGER,

  -- Revival after a long dormancy.
  comeback_gap        INTEGER,
  comeback_year       INTEGER,
  comeback_strength   REAL,

  -- Geography, from name_states.
  top_state           TEXT,
  top_state_share     REAL,               -- 0..1 of state-attributed births
  exclusive_state     TEXT,               -- set only when the share clears the floor
  states_seen         INTEGER,

  -- Spelling family (packages/shared/src/variant-key.ts).
  variant_key         TEXT    NOT NULL,
  variant_count       INTEGER NOT NULL DEFAULT 1,
  variant_is_primary  INTEGER NOT NULL DEFAULT 0,

  -- Denormalized head of name_catalysts, so the story strip needs no join.
  catalyst_year       INTEGER,
  catalyst_title      TEXT,
  catalyst_type       TEXT,

  source_data_version TEXT,
  analysis_year       INTEGER NOT NULL,
  PRIMARY KEY (name_lower, sex)
);

-- Spelling relatives: one equality lookup, no scan.
CREATE INDEX IF NOT EXISTS idx_name_facts_variant   ON name_facts(variant_key, variant_count DESC);
CREATE INDEX IF NOT EXISTS idx_name_facts_rarity    ON name_facts(sex, rarity_rank_sex);
CREATE INDEX IF NOT EXISTS idx_name_facts_exclusive ON name_facts(exclusive_state, top_state_share DESC);
CREATE INDEX IF NOT EXISTS idx_name_facts_spike     ON name_facts(spike_ratio DESC);

-- Collection membership. Materialized rather than computed per request: the
-- predicates live in packages/shared/src/collections.ts and several of them
-- (rarity percentile, spelling-family size) are not expressible as a cheap
-- indexed WHERE clause.
CREATE TABLE IF NOT EXISTS name_collections (
  slug         TEXT    NOT NULL,
  name_lower   TEXT    NOT NULL,
  sex          TEXT    NOT NULL CHECK (sex IN ('M','F')),
  name         TEXT    NOT NULL,
  rank_in      INTEGER NOT NULL,   -- 1..N display order
  metric_label TEXT,               -- rendered in the collection's metric column
  metric_value REAL,               -- sortable value behind the label
  PRIMARY KEY (slug, name_lower, sex)
);

-- The name-page backlink lookup: WHERE name_lower = ? AND sex = ?.
CREATE INDEX IF NOT EXISTS idx_name_collections_name ON name_collections(name_lower, sex, rank_in);
-- The collection-page lookup. The PK prefix covers the filter, but this keeps
-- rank_in in the index so the ORDER BY needs no sort.
CREATE INDEX IF NOT EXISTS idx_name_collections_slug ON name_collections(slug, rank_in);
