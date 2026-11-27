// Which /name/<x>/ pages search engines should index.
//
// This is the TypeScript twin of the WHERE clause in `listIndexableNames`
// (d1-queries.ts), which decides sitemap membership. The name page uses it to
// emit `noindex,follow` on every name the sitemap leaves out, so the two
// signals agree: a page is either in the sitemap and indexable, or out of the
// sitemap and noindex. A name crosses back automatically once its counts pass
// the gate on the next ingest. `scripts/name-indexability.test.ts` runs the SQL
// and this function over the same fixtures, so change both together.

import type { NameRow } from "./schema";

type GateRow = Pick<NameRow, "total_count" | "peak_count" | "latest_count" | "status" | "curr_decade" | "growth_x">;

export function nameQualityScore(row: GateRow): number {
  const currDecade = row.curr_decade ?? 0;
  const growth = row.growth_x ?? 0;
  let score = 0;
  if (row.total_count >= 1000) score += 2;
  if (row.peak_count >= 100) score += 2;
  else if (row.peak_count >= 50) score += 1;
  if (row.latest_count >= 50) score += 2;
  else if (row.latest_count >= 20) score += 1;
  if (currDecade >= 250) score += 2;
  else if (currDecade >= 100) score += 1;
  if (growth >= 3) score += 2;
  else if (growth >= 1.5) score += 1;
  if (row.status === "stable" || row.status === "rising") score += 1;
  else if (row.status === "endangered" && row.peak_count >= 500) score += 1;
  else if (row.status === "extinct" && row.total_count >= 5000) score += 1;
  return score;
}

export function isIndexableNameRow(row: GateRow): boolean {
  return (
    nameQualityScore(row) >= 3 &&
    (row.total_count >= 300 || row.peak_count >= 40 || row.latest_count >= 10 || (row.curr_decade ?? 0) >= 50)
  );
}

/**
 * The sitemap judges a name by its strongest sex row (most births, then the
 * higher peak), so the page must judge it by the same row.
 */
export function isIndexableName(rows: readonly GateRow[]): boolean {
  if (!rows.length) return false;
  const canonical = [...rows].sort((a, b) => b.total_count - a.total_count || b.peak_count - a.peak_count)[0]!;
  return isIndexableNameRow(canonical);
}
