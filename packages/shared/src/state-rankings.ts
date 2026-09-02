// Pre-computed per-state rankings (`state_year_rankings`, migration 0024) and
// per-(state, year) totals (`state_year_totals`).
//
// Ranking names within a state is the state-hub equivalent of the national
// problem rankings.ts solves: the window-function query touches every
// name_states row for a (state, year) (~57k rows) to return 100. This module
// owns the writer side — the SQL that fills the tables — so the backfill
// script and the state-ingest finalize step stay in sync. Readers live in
// d1-queries.ts.
//
// The readiness contract mirrors rankings.ts exactly: readers gate on the
// `state_rankings_version` meta key and transparently fall back to the live
// query over name_states whenever the tables are absent, half-built, or
// stale.

import type { D1Database } from "@cloudflare/workers-types";
import { META_KEYS } from "./schema";
import { ALL_STATES } from "./us-states-map";

// Ranks deeper than this are not stored. The state hub shows the top 100 per
// sex; the cap keeps the table at ~51 states × ~115 years × 2 × 100 rows
// (~1.2M) instead of mirroring all ~6.6M name_states rows.
export const STATE_RANKINGS_PER_SEX_LIMIT = 100;

// Statements that rebuild one (state, year) in place. DELETE first so ranks
// that no longer exist do not survive as stale rows — INSERT OR REPLACE alone
// only overwrites ranks the new data happens to reach.
//
// The window function is deliberately scoped to a single (state, year):
// partitioning over the whole name_states table materializes ~6.6M rows and
// blows the Worker memory budget D1 runs under (Cloudflare Error 1101).
export function stateRankingsRebuildSql(): { del: string; ins: string; totalsDel: string; totalsIns: string } {
  return {
    del: `DELETE FROM state_year_rankings WHERE state = ?1 AND year = ?2`,
    ins: `INSERT INTO state_year_rankings (state, year, sex, rank, name, count)
          WITH ranked AS (
            SELECT state, year, sex, name, count,
                   ROW_NUMBER() OVER (
                     PARTITION BY sex
                     ORDER BY count DESC, name ASC
                   ) AS rank
              FROM name_states
             WHERE state = ?1 AND year = ?2
          )
          SELECT state, year, sex, rank, name, count
            FROM ranked
           WHERE rank <= ?3`,
    totalsDel: `DELETE FROM state_year_totals WHERE state = ?1 AND year = ?2`,
    totalsIns: `INSERT INTO state_year_totals (state, year, births, names)
                SELECT state, year, SUM(count) AS births, COUNT(DISTINCT name) AS names
                  FROM name_states
                 WHERE state = ?1 AND year = ?2
                 GROUP BY state, year`,
  };
}

// How many (state, year) pairs to pipeline per db.batch(). Each statement is
// bounded to one pair, so peak memory stays flat while round-trips amortize.
const REBUILD_PAIR_BATCH = 12;

export interface StateYearPair {
  state: string;
  year: number;
}

// Rebuilds rankings + totals for the given (state, year) pairs. Safe to
// re-run: each pair is deleted and re-inserted inside the same batch.
//
// A rebuild is NOT atomic — pairs land batch by batch. Callers that make the
// tables visible to readers must go through publishStateRankings() so a
// half-built table is never served.
export async function rebuildStateRankings(
  db: D1Database,
  pairs: StateYearPair[],
  perSex = STATE_RANKINGS_PER_SEX_LIMIT,
): Promise<number> {
  const { del, ins, totalsDel, totalsIns } = stateRankingsRebuildSql();
  let done = 0;
  for (let i = 0; i < pairs.length; i += REBUILD_PAIR_BATCH) {
    const slice = pairs.slice(i, i + REBUILD_PAIR_BATCH);
    const stmts = [];
    for (const { state, year } of slice) {
      stmts.push(db.prepare(del).bind(state, year));
      stmts.push(db.prepare(ins).bind(state, year, perSex));
      stmts.push(db.prepare(totalsDel).bind(state, year));
      stmts.push(db.prepare(totalsIns).bind(state, year));
    }
    await db.batch(stmts);
    done += slice.length;
  }
  return done;
}

/** The full (state, year) grid for the dataset — every state × every year. */
export function allStateYearPairs(years: number[]): StateYearPair[] {
  const pairs: StateYearPair[] = [];
  for (const state of ALL_STATES) {
    for (const year of years) pairs.push({ state, year });
  }
  return pairs;
}

// Readiness marker. Same single-meta-write atomic flip as rankings.ts:
// retiring first and publishing last means every window in which the tables
// are incomplete reads as "not ready", and readers fall back to the live
// query over name_states.
export async function retireStateRankings(db: D1Database): Promise<void> {
  await db
    .prepare(
      `INSERT INTO meta(key, value) VALUES(?1, '')
         ON CONFLICT(key) DO UPDATE SET value = ''`,
    )
    .bind(META_KEYS.stateRankingsVersion)
    .run();
}

export async function publishStateRankings(
  db: D1Database,
  pairs: StateYearPair[],
  dataVersion: string,
  perSex = STATE_RANKINGS_PER_SEX_LIMIT,
): Promise<number> {
  if (!dataVersion) throw new Error("publishStateRankings requires a non-empty dataVersion");
  await retireStateRankings(db);
  const done = await rebuildStateRankings(db, pairs, perSex);
  await db
    .prepare(
      `INSERT INTO meta(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(META_KEYS.stateRankingsVersion, dataVersion)
    .run();
  return done;
}

// True when the tables are fully built for the dataset currently being served.
export async function stateRankingsReady(db: D1Database): Promise<boolean> {
  const r = await db
    .prepare(`SELECT key, value FROM meta WHERE key IN (?1, ?2)`)
    .bind(META_KEYS.dataVersion, META_KEYS.stateRankingsVersion)
    .all<{ key: string; value: string }>();
  let dataVersion = "";
  let stateRankingsVersion = "";
  for (const row of r.results ?? []) {
    if (row.key === META_KEYS.dataVersion) dataVersion = row.value ?? "";
    else stateRankingsVersion = row.value ?? "";
  }
  return !!dataVersion && dataVersion === stateRankingsVersion;
}

// Carries a valid state-rankings cache across a data_version bump that did
// not touch name_states — same contract as revalidateRankings in rankings.ts.
export async function revalidateStateRankings(db: D1Database, newDataVersion: string): Promise<void> {
  if (!newDataVersion) throw new Error("revalidateStateRankings requires a non-empty dataVersion");
  if (!(await stateRankingsReady(db))) return;
  await db
    .prepare(
      `INSERT INTO meta(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(META_KEYS.stateRankingsVersion, newDataVersion)
    .run();
}
