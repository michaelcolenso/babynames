// D1 batched writes for the ingest pipeline. Rows arrive on a queue in
// chunks of ~1 000 and are merged into a per-run buffer table; the
// finalize step aggregates the buffer into the staging name tables, then
// renames staging onto live in one transaction.

import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { rowsPerStatement } from "@nv/shared";
import type { ChunkRow, StateRow, YearTotalRow } from "./chunks";

export const RAW_STAGING_DDL = `CREATE TABLE IF NOT EXISTS name_year_raw_staging (
  run_id TEXT NOT NULL,
  year   INTEGER NOT NULL,
  name   TEXT NOT NULL,
  sex    TEXT NOT NULL CHECK (sex IN ('M','F')),
  count  INTEGER NOT NULL,
  PRIMARY KEY (run_id, year, name, sex)
)`;

// finalize pages through this buffer by (name, sex), but the primary key leads
// with year. Without a (run_id, name, sex, year) index every page reads the whole
// run (~2.2M rows) twice, and a run is ~590 pages. Measured in local SQLite on a
// synthetic table of production size (117 820 pairs, 2.2M rows): 1.6 s a page
// without the index, 9 ms with it. A comparable full pass over a table that size
// took 7.9 s on D1.
export const RAW_STAGING_BY_NAME_DDL =
  "CREATE INDEX IF NOT EXISTS name_year_raw_staging_by_name ON name_year_raw_staging(run_id, name, sex, year)";

export async function ensureStaging(db: D1Database): Promise<void> {
  await db.exec(RAW_STAGING_DDL.replace(/\n/g, " "));
  await db.exec(RAW_STAGING_BY_NAME_DDL);
}

export async function clearStagingForRun(db: D1Database, runId: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM name_year_raw_staging WHERE run_id = ?1").bind(runId),
    db.prepare("DELETE FROM names_staging"),
    db.prepare("DELETE FROM name_years_staging"),
  ]);
}

// `?, ?, ..., ?` for one row of a multi-row INSERT ... VALUES.
const placeholderTuple = (columns: number): string => `(${Array.from({ length: columns }, () => "?").join(", ")})`;

// A national `rows` chunk row binds 5 placeholders (run_id, year, name, sex,
// count), so D1's 100-variable ceiling allows 20 rows per statement: a full
// 1 000-row message is 50 statements, sent as one batch.
const RAW_ROW_COLUMNS = 5;
const RAW_ROW_TUPLE = placeholderTuple(RAW_ROW_COLUMNS);
const RAW_STMT_ROWS = rowsPerStatement(RAW_ROW_COLUMNS);

export async function insertRowChunk(
  db: D1Database,
  runId: string,
  year: number,
  rows: ChunkRow[],
): Promise<void> {
  if (!rows.length) return;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += RAW_STMT_ROWS) {
    const slice = rows.slice(i, i + RAW_STMT_ROWS);
    const sql =
      `INSERT OR REPLACE INTO name_year_raw_staging(run_id, year, name, sex, count) VALUES ` +
      slice.map(() => RAW_ROW_TUPLE).join(",");
    const binds: (string | number)[] = [];
    for (const r of slice) binds.push(runId, year, r.name, r.sex, r.count);
    stmts.push(db.prepare(sql).bind(...binds));
  }
  await db.batch(stmts);
}

// A state row binds 5 placeholders (name, sex, year, state, count), so D1's
// 100-variable ceiling allows 20 rows per statement: a full 1 000-row message is
// 50 statements, sent as one batch.
const STATE_ROW_COLUMNS = 5;
const STATE_ROW_TUPLE = placeholderTuple(STATE_ROW_COLUMNS);
const STATE_STMT_ROWS = rowsPerStatement(STATE_ROW_COLUMNS);

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
      slice.map(() => STATE_ROW_TUPLE).join(",");
    const binds: (string | number)[] = [];
    for (const r of slice) binds.push(r.name, r.sex, r.year, r.state, r.count);
    stmts.push(db.prepare(sql).bind(...binds));
  }
  await db.batch(stmts);
}

// A year total binds 3 placeholders (year, sex, total): 33 rows (99 variables)
// per statement, so the 290 (year, sex) totals SSA publishes take 9.
const TOTALS_COLUMNS = 3;
const TOTALS_TUPLE = placeholderTuple(TOTALS_COLUMNS);
const TOTALS_STMT_ROWS = rowsPerStatement(TOTALS_COLUMNS);

export async function upsertYearTotals(
  db: D1Database,
  totals: YearTotalRow[],
): Promise<void> {
  if (!totals.length) return;
  const batches: D1PreparedStatement[] = [];
  for (let i = 0; i < totals.length; i += TOTALS_STMT_ROWS) {
    const slice = totals.slice(i, i + TOTALS_STMT_ROWS);
    const sql =
      `INSERT INTO year_totals(year, sex, total) VALUES ` +
      slice.map(() => TOTALS_TUPLE).join(",") +
      ` ON CONFLICT(year, sex) DO UPDATE SET total = excluded.total`;
    const binds: (string | number)[] = [];
    for (const r of slice) binds.push(r.year, r.sex, r.total);
    batches.push(db.prepare(sql).bind(...binds));
  }
  await db.batch(batches);
}
