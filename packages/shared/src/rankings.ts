// Pre-computed per-year rankings (`name_rankings_by_year`, migration 0022).
//
// Ranking names for a year is the most expensive read shape in the app: the
// window-function query touches every name_years row for that year (~137k rows
// for a modern year) to return 10–30. This module owns the writer side — the
// SQL that fills the table — so the backfill script and the ingest finalize
// step stay in sync. Readers live in d1-queries.ts.

import type { D1Database } from "@cloudflare/workers-types";
import { META_KEYS } from "./schema";

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
//
// A rebuild is NOT atomic — years land batch by batch. Callers that make the
// table visible to readers must go through publishRankings() so a half-built
// table is never served (a partially populated table would let /api/meta return
// only the years written so far, and that response is edge-cached for a week).
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

// Readiness marker. The rankings table is a derived cache with no staging-swap
// equivalent, so visibility is gated on a meta key instead: readers trust the
// table only while `rankings_version` equals the live `data_version`.
//
// Retiring the marker first and re-publishing it last means every window in
// which the table is incomplete — the initial backfill, and every ingest
// rebuild — reads as "not ready", and readers transparently fall back to the
// live ranking query. Publishing is a single meta write, so the flip is atomic
// from a reader's point of view.
export async function retireRankings(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO meta(key, value) VALUES(?1, '')
         ON CONFLICT(key) DO UPDATE SET value = ''`,
    )
    .bind(META_KEYS.rankingsVersion)
    .run();
}

export async function publishRankings(
  db: D1Database,
  years: number[],
  dataVersion: string,
  perSex = RANKINGS_PER_SEX_LIMIT,
): Promise<number> {
  if (!dataVersion) throw new Error("publishRankings requires a non-empty dataVersion");
  await retireRankings(db);
  const done = await rebuildRankings(db, years, perSex);
  await db
    .prepare(
      `INSERT INTO meta(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(META_KEYS.rankingsVersion, dataVersion)
    .run();
  return done;
}

// True when the table is fully built for the dataset currently being served.
// Both values must be non-empty: a database that has never recorded a
// data_version must not match an empty marker.
export async function rankingsReady(db: D1Database): Promise<boolean> {
  const r = await db
    .prepare(`SELECT key, value FROM meta WHERE key IN (?1, ?2)`)
    .bind(META_KEYS.dataVersion, META_KEYS.rankingsVersion)
    .all<{ key: string; value: string }>();
  let dataVersion = "";
  let rankingsVersion = "";
  for (const row of r.results ?? []) {
    if (row.key === META_KEYS.dataVersion) dataVersion = row.value ?? "";
    else rankingsVersion = row.value ?? "";
  }
  return !!dataVersion && dataVersion === rankingsVersion;
}

// Carries a valid rankings cache across a data_version bump that did not touch
// name_years — the diaspora recompute paths bump data_version purely to bust
// edge caches. Without this, those bumps would strand the marker on the old
// version and force every ranking read back onto the live query until the next
// SSA ingest, potentially a year away.
//
// Call before writing the new data_version: stamping the marker first can only
// produce a brief marker-ahead-of-data mismatch, which readers treat as "not
// ready" and serve from the live query. The reverse order would briefly present
// a stale cache as current.
export async function revalidateRankings(db: D1Database, newDataVersion: string): Promise<void> {
  if (!newDataVersion) throw new Error("revalidateRankings requires a non-empty dataVersion");
  if (!(await rankingsReady(db))) return;
  await db
    .prepare(
      `INSERT INTO meta(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(META_KEYS.rankingsVersion, newDataVersion)
    .run();
}
