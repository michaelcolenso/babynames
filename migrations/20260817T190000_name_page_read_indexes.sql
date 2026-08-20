-- Indexes for the /name/:name discovery queries.
--
-- These five queries ran on every server-rendered name page and accounted for
-- ~90% of the database's total rows read (~15B of 16.6B in a representative
-- week). Each returned 4-12 rows but had no index able to serve its filter or
-- its ORDER BY, so SQLite scanned a large slice of `names` and sorted it in a
-- temp b-tree. D1 bills every row examined, not every row returned.
--
-- Paired with the bounded two-sided scans in listRelatedNames /
-- listStatusNeighbors / listPeakEraNeighbors (packages/shared/src/d1-queries.ts),
-- which replace `ORDER BY ABS(col - ?)` with a walk outward from the target
-- value in both directions. Those rewrites only pay off with these indexes in
-- place — apply this migration before or with that code.

-- listCurrentAlternatives: WHERE sex = ? AND latest_count > 0 ORDER BY
-- latest_count DESC, curr_decade DESC, peak_count DESC, name.
-- Full ORDER BY lives in the index, so the LIMIT terminates after a few rows
-- instead of ranking every live name for the sex.
CREATE INDEX IF NOT EXISTS names_sex_latest
  ON names(sex, latest_count DESC, curr_decade DESC, peak_count DESC, name);

-- listPeakEraNeighbors: WHERE sex = ? AND peak_year BETWEEN ? AND ?.
CREATE INDEX IF NOT EXISTS names_sex_peak_year
  ON names(sex, peak_year);

-- listRelatedNames: WHERE sex = ? AND status = ?, walking outward on peak_year.
CREATE INDEX IF NOT EXISTS names_sex_status_peak_year
  ON names(sex, status, peak_year);

-- listStatusNeighbors: WHERE sex = ? AND status = ?, walking outward on
-- total_count.
CREATE INDEX IF NOT EXISTS names_sex_status_total
  ON names(sex, status, total_count);

-- getNameStrongholds resolves `era_start_year = (SELECT MAX(era_start_year)
-- FROM name_regional_anomalies)`. The subquery is uncorrelated but
-- era_start_year is the *last* column of the primary key, so MAX() could only
-- be answered by scanning the whole PK index — 27,928 rows on every name page,
-- to return at most 12. With era_start_year leading its own index the MAX is a
-- single seek to the end of the b-tree.
CREATE INDEX IF NOT EXISTS name_regional_anomalies_era
  ON name_regional_anomalies(era_start_year);
