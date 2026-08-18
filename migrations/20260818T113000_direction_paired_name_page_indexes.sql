-- Completes the fix started in 20260818T110000_widen_name_page_neighbor_indexes.sql.
--
-- That migration widened names_sex_peak_year and names_sex_status_peak_year to
-- cover the full ORDER BY of listPeakEraNeighbors / listRelatedNames, but only
-- verified the "up" (ascending) side of each bounded two-sided walk
-- (packages/shared/src/d1-queries.ts). Production traffic in the minutes after
-- it deployed showed the "down" side still costing hundreds to thousands of
-- rows per call.
--
-- The reason: reversing a scan over a single index reverses the effective sort
-- order of *every* column in it, not just the leading one. An index built as
-- (sex, peak_year ASC, peak_count DESC, total_count DESC, name ASC), walked
-- backwards for `peak_year <= ? ORDER BY peak_year DESC`, yields
-- `peak_count ASC, total_count ASC, name DESC` — the opposite of what the
-- query asks for on those columns — so SQLite still needs a temp b-tree sort
-- for every row in range. One index cannot serve both directions of a
-- multi-column sort; each direction needs its own, with only the leading
-- range column's direction flipped and the tie-break columns held fixed.
-- Verified on a local replica built with a lopsided peak_year distribution
-- matching production's shape: adding the DESC-leading twin removed the sort
-- ("USE TEMP B-TREE FOR ... ORDER BY") from the down-side EXPLAIN QUERY PLAN
-- entirely, for all three rewritten queries.
--
-- listStatusNeighbors (walking total_count) had the same latent bug from the
-- original 20260817T190000_name_page_read_indexes.sql migration — its index
-- was never widened past (sex, status, total_count), so *both* directions
-- have always paid for a temp sort. This migration fixes it at the same time.
--
-- names_sex_peak_year and names_sex_status_peak_year (added 20260817, widened
-- 20260818T110000) are left in place — they already serve the "up" direction
-- correctly and dropping them would cost a rebuild for no benefit. Only the
-- missing "down" halves are added here, plus the two-directional replacement
-- for names_sex_status_total.

-- listPeakEraNeighbors, "down" side: WHERE peak_year <= ? ORDER BY
-- peak_year DESC, peak_count DESC, total_count DESC, name.
CREATE INDEX IF NOT EXISTS names_sex_peak_year_desc
  ON names(sex, peak_year DESC, peak_count DESC, total_count DESC, name);

-- listRelatedNames, "down" side: WHERE peak_year <= ? ORDER BY
-- peak_year DESC, total_count DESC, name.
CREATE INDEX IF NOT EXISTS names_sex_status_peak_year_desc
  ON names(sex, status, peak_year DESC, total_count DESC, name);

-- listStatusNeighbors walks total_count in both directions; the original
-- index never covered the tie-break columns for either. Replaced with a
-- direction-paired set, same shape as the two above.
DROP INDEX IF EXISTS names_sex_status_total;

CREATE INDEX IF NOT EXISTS names_sex_status_total_asc
  ON names(sex, status, total_count ASC, peak_count DESC, latest_count DESC, name);

CREATE INDEX IF NOT EXISTS names_sex_status_total_desc
  ON names(sex, status, total_count DESC, peak_count DESC, latest_count DESC, name);
