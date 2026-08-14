-- Persist the exact source scan used to build each decade-hub payload.
-- Existing rows remain NULL until the seeder proves their payload and metadata
-- are byte-identical to an approved managed artifact, then conditionally backfills
-- the fingerprint under --apply. Differing legacy rows fail closed.
ALTER TABLE decade_hub ADD COLUMN source_fingerprint TEXT;
