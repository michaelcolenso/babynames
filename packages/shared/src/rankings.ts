// Pre-computed per-year rankings (`name_rankings_by_year`, migration 0022).
//
// Ranking names for a year is the most expensive read shape in the app: the
// window-function query touches every name_years row for that year (~137k rows
// for a modern year) to return 10–30. This module owns the writer side — the
// SQL that fills the table — so the backfill script and the ingest finalize
// step stay in sync. Readers live in d1-queries.ts.

import type { D1Database } from "@cloudflare/workers-types";

// Ranks deeper than this are not stored. Every current caller asks for far
// less (meta: 10, /api/year: 25, river: 30); the cap keeps the table at
// ~2 * 200 rows per year (~58k total) instead of mirroring name_years.
// Readers must fall back to the live query when they need more than this.
export const RANKINGS_PER_SEX_LIMIT = 200;

// Statements that rebuild one year in place. DELETE first so ranks that no
// longer exist (a year losing names) do not survive as stale rows — INSERT OR
// REPLACE alone only overwrites ranks the new data happens to reach.
//
// The window function is deliberately scoped to a single year: partitioning
// over the whole table materializes ~1.9M rows and blows the Worker memory
// budget D1 runs under (Cloudflare Error 1101).
export function rankingsRebuildSql(): { del: string; ins: string } {
  return {
    del: `DELETE FROM name_rankings_by_year WHERE year = ?1`,
    ins: `INSERT INTO name_rankings_by_year (year, sex, rank, name, count)
          WITH ranked AS (
            SELECT ny.year AS year,
                   n.sex AS sex,
                   n.name AS name,
                   ny.count AS count,
                   ROW_NUMBER() OVER (
                     PARTITION BY n.sex
                     ORDER BY ny.count DESC, n.name ASC
                   ) AS rank
              FROM name_years ny
              JOIN names n ON n.id = ny.name_id
             WHERE ny.year = ?1
          )
          SELECT year, sex, rank, name, count
            FROM ranked
           WHERE rank <= ?2`,
  };
}

// How many years to pipeline per db.batch(). Matches the request-time batching
// in d1-queries.ts — each statement is bounded to one year, so peak memory
// stays flat while the round-trips are amortized.
const REBUILD_YEAR_BATCH = 12;

// Rebuilds the rankings for the given years. Safe to re-run: each year is
// deleted and re-inserted inside the same batch.
export async function rebuildRankings(
  db: D1Database,
  years: number[],
  perSex = RANKINGS_PER_SEX_LIMIT,
): Promise<number> {
  const { del, ins } = rankingsRebuildSql();
  let done = 0;
  for (let i = 0; i < years.length; i += REBUILD_YEAR_BATCH) {
    const slice = years.slice(i, i + REBUILD_YEAR_BATCH);
    const stmts = [];
    for (const year of slice) {
      stmts.push(db.prepare(del).bind(year));
      stmts.push(db.prepare(ins).bind(year, perSex));
    }
    await db.batch(stmts);
    done += slice.length;
  }
  return done;
}
