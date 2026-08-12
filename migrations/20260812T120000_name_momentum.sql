-- Precomputed 5-year momentum signals for names crossing the SSA's reporting
-- floor (5 births/year). One row per (name_id, direction):
--   direction = 'rising' backs /emerging — names climbing out of the floor,
--     real sustained growth across window_start..window_end.
--   direction = 'fading' backs /fading — names sinking back toward the floor
--     after peaking before window_start.
--
-- Computed offline (not queried live) since SSA data only updates ~once/year.
-- Regenerated with the window shifted forward whenever name_years is
-- re-seeded from a new SSA release — see README for the refresh mechanism.
--
-- This table is already populated in production; this migration exists for
-- repo history and to keep local/preview D1 instances in schema parity.
CREATE TABLE IF NOT EXISTS name_momentum (
  name_id       INTEGER NOT NULL REFERENCES names(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sex           TEXT NOT NULL CHECK (sex IN ('M','F')),
  direction     TEXT NOT NULL CHECK (direction IN ('rising','fading')),
  first_year    INTEGER NOT NULL,
  peak_year     INTEGER NOT NULL,
  peak_count    INTEGER NOT NULL,
  total_count   INTEGER NOT NULL,
  y1            INTEGER NOT NULL,
  y2            INTEGER NOT NULL,
  y3            INTEGER NOT NULL,
  y4            INTEGER NOT NULL,
  y5            INTEGER NOT NULL,
  momentum      INTEGER NOT NULL,
  eta_year      INTEGER,
  window_start  INTEGER NOT NULL,
  window_end    INTEGER NOT NULL,
  computed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (name_id, direction)
);
CREATE INDEX IF NOT EXISTS idx_momentum_direction_rank ON name_momentum(direction, momentum DESC);
CREATE INDEX IF NOT EXISTS idx_momentum_direction_sex ON name_momentum(direction, sex, momentum DESC);
CREATE INDEX IF NOT EXISTS idx_momentum_eta ON name_momentum(direction, eta_year);
