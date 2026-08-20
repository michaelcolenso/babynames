-- Widens two of the five indexes added in
-- 20260817T190000_name_page_read_indexes.sql for listPeakEraNeighbors and
-- listRelatedNames.
--
-- Production data showed those two queries costing far more than the local
-- replica used to design the original migration predicted: the replica
-- spread peak_year roughly evenly (~400 names/year), but production is
-- lopsided — 1,272 F names alone share peak_year=2014. The bounded walk in
-- d1-queries.ts (packages/shared/src/d1-queries.ts) orders each side by
-- `peak_year ASC/DESC, peak_count DESC, total_count DESC, name` but the old
-- indexes only covered the leading `peak_year` column, so SQLite still had to
-- pull every row in the matching peak_year (and status, for the related-names
-- query) and rank it in a temp b-tree before applying LIMIT. Measured in
-- production 10 minutes after that migration deployed:
--   listPeakEraNeighbors: ~3,187 rows/call (not the <50 the replica predicted)
--   listRelatedNames:     ~1,260 rows/call
--
-- Folding the ORDER BY's remaining columns into the index lets SQLite walk it
-- in already-sorted order and stop at LIMIT — confirmed on a local replica:
-- `EXPLAIN QUERY PLAN` drops "USE TEMP B-TREE FOR ... ORDER BY" entirely once
-- the index covers the full sort.
--
-- Same index names as before — DROP + CREATE rather than a rename, so nothing
-- else needs to change to pick this up. rebuildIndexesIfNeeded() in
-- apps/ingest-worker/src/compute.ts must carry the same widened definitions or
-- the next ingest finalize reverts to the narrower ones.

DROP INDEX IF EXISTS names_sex_peak_year;
CREATE INDEX IF NOT EXISTS names_sex_peak_year
  ON names(sex, peak_year, peak_count DESC, total_count DESC, name);

DROP INDEX IF EXISTS names_sex_status_peak_year;
CREATE INDEX IF NOT EXISTS names_sex_status_peak_year
  ON names(sex, status, peak_year, total_count DESC, name);
