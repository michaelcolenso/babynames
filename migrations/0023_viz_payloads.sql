-- Pre-computed payloads for the whole-dataset visualisation endpoints.
--
-- /api/concentration, /api/terminal-letters, /api/suffix-waves and
-- /api/name-survival each aggregate every row in name_years to emit a few
-- hundred KB of JSON. Measured on production, a single uncached request read
-- 15.3M / 4.4M / 4.4M / 6.8M rows and took 8–34 seconds. The inputs change once
-- a year, so the work belongs at ingest time, not per request.
--
-- One row per endpoint, holding the finished response body. Same shape as the
-- decade_hub table: read is a single primary-key lookup.
--
-- `source_version` is the meta.data_version the payload was built from. Readers
-- require it to match the live data_version, so a stale or half-written payload
-- is never served — they fall back to computing live. Each key is published by a
-- single row write, so publication is atomic per endpoint with no separate
-- readiness marker to keep in sync.
CREATE TABLE IF NOT EXISTS viz_payloads (
  key            TEXT PRIMARY KEY,
  payload        TEXT NOT NULL,
  source_version TEXT NOT NULL,
  generated_at   TEXT NOT NULL
);
