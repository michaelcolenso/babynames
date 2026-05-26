// D1 batched writes for the ingest pipeline. Rows arrive on a queue in
// chunks of ~1 000 and are merged into a per-run buffer table; the
// finalize step aggregates the buffer into the staging name tables, then
// renames staging onto live in one transaction.

import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import type { ChunkRow, StateRow, YearTotalRow } from "./chunks";

export const RAW_STAGING_DDL = `CREATE TABLE IF NOT EXISTS name_year_raw_staging (
  run_id TEXT NOT NULL,
  year   INTEGER NOT NULL,
  name   TEXT NOT NULL,
  sex    TEXT NOT NULL CHECK (sex IN ('M','F')),
  count  INTEGER NOT NULL,
  PRIMARY KEY (run_id, year, name, sex)
)`;

export async function ensureStaging(db: D1Database): Promise<void> {
  await db.exec(RAW_STAGING_DDL.replace(/\n/g, " "));
}

export async function clearStagingForRun(db: D1Database, runId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM name_year_raw_staging WHERE run_id = ?1").bind(runId),
    db.prepare("DELETE FROM names_staging"),
    db.prepare("DELETE FROM name_years_staging"),
  ]);
}

// 100 rows per INSERT keeps each statement well under D1's bind cap and
// yields ~10 statements per chunk, ~10 subrequests per consumer call.
const STMT_ROWS = 100;
const STATE_STMT_ROWS = 20;

export async function insertRowChunk(
  db: D1Database,
  runId: string,
  year: number,
  rows: ChunkRow[],
): Promise<void> {
  if (!rows.length) return;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += STMT_ROWS) {
    const slice = rows.slice(i, i + STMT_ROWS);
    const sql =
      `INSERT OR REPLACE INTO name_year_raw_staging(run_id, year, name, sex, count) VALUES ` +
      slice.map(() => "(?, ?, ?, ?, ?)").join(",");
    const binds: (string | number)[] = [];
    for (const r of slice) binds.push(runId, year, r.name, r.sex, r.count);
    stmts.push(db.prepare(sql).bind(...binds));
  }
  await db.batch(stmts);
}

// Raw state rows go straight to the live name_states table. INSERT OR REPLACE
// is idempotent on the PK so queue retries are safe; no staging is needed
// because name_states is read only by the diaspora compute step, never /api/*.
export async function insertStateRows(db: D1Database, rows: StateRow[]): Promise<void> {
  if (!rows.length) return;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += STATE_STMT_ROWS) {
    const slice = rows.slice(i, i + STATE_STMT_ROWS);
    const sql =
      `INSERT OR REPLACE INTO name_states(name, sex, year, state, count) VALUES ` +
      slice.map(() => "(?, ?, ?, ?, ?)").join(",");
    const binds: (string | number)[] = [];
    for (const r of slice) binds.push(r.name, r.sex, r.year, r.state, r.count);
    stmts.push(db.prepare(sql).bind(...binds));
  }
  await db.batch(stmts);
}

export async function upsertYearTotals(
  db: D1Database,
  totals: YearTotalRow[],
): Promise<void> {
  if (!totals.length) return;
  const batches: D1PreparedStatement[] = [];
  const ROWS_PER_STMT = 50;
  for (let i = 0; i < totals.length; i += ROWS_PER_STMT) {
    const slice = totals.slice(i, i + ROWS_PER_STMT);
    const sql =
      `INSERT INTO year_totals(year, sex, total) VALUES ` +
      slice.map(() => "(?, ?, ?)").join(",") +
      ` ON CONFLICT(year, sex) DO UPDATE SET total = excluded.total`;
    const binds: (string | number)[] = [];
    for (const r of slice) binds.push(r.year, r.sex, r.total);
    batches.push(db.prepare(sql).bind(...binds));
  }
  await db.batch(batches);
}
