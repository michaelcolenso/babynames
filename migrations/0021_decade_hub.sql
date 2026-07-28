-- Decade hub payload table (SPEC §1). One row per decade keeps request cost at
-- one primary-key read; `payload` holds the full DecadeProfile JSON generated
-- by scripts/build-decade-hub.ts (data/dist/decade-hub-1980.sql).
CREATE TABLE IF NOT EXISTS decade_hub (
  decade TEXT PRIMARY KEY,
  methodology_version TEXT NOT NULL,
  source_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
