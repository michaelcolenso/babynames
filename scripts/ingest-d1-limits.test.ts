#!/usr/bin/env tsx
// The state-ingest queue chain (state-rows -> diaspora-finalize) writes to D1
// with multi-row INSERTs. Production D1 rejects any statement that binds more
// than 100 variables, while local SQLite accepts far more, so the chain passed
// every local check and still failed on its first write in production:
// "D1_ERROR: too many SQL variables at offset 519", the 101st placeholder of a
// 500-variable diaspora INSERT. These tests run the real chain code against a
// real SQLite database behind a D1 stand-in that enforces the same ceiling.
//
//   npm run test:ingest-limits

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import { D1_MAX_BOUND_PARAMS, rowsPerStatement } from "../packages/shared/src/d1-chunk";
import {
  addTotal,
  clearDiasporaStaging,
  computeDiasporaChunk,
  computeDiasporaForName,
  loadStateYearTotals,
  swapDiasporaStaging,
  type StateCountRow,
  type StateYearTotals,
} from "../apps/ingest-worker/src/diaspora-compute";
import { STATE_CHUNK_ROWS, type StateRow } from "../apps/ingest-worker/src/chunks";
import { insertStateRows } from "../apps/ingest-worker/src/upsert";

// node:sqlite ships in Node 22+ (CI runs 22). Resolve it lazily and skip rather
// than failing the whole `npm test` run on an older Node.
type SqliteStatement = {
  all(...p: never[]): unknown[];
  get(...p: never[]): unknown;
  run(...p: never[]): unknown;
};
type SqliteDb = { exec(sql: string): void; prepare(sql: string): SqliteStatement };
let DatabaseSync: (new (p: string) => SqliteDb) | null = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = null;
}
const skip = DatabaseSync ? false : "requires node:sqlite (Node 22+)";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const migration = (file: string): string => readFileSync(path.join(REPO, "migrations", file), "utf-8");

// ---- D1 stand-in ----------------------------------------------------------

// SQLite numbers variables as it parses: a bare `?` takes one more than the
// highest number so far, `?N` takes N. Returns the highest number (the
// statement's variable count) and the 0-based offset of the first variable
// above `limit` (-1 when there is none), which is the offset D1 reports.
function scanVariables(sql: string, limit: number): { count: number; offsetOverLimit: number } {
  let next = 0;
  let max = 0;
  let over = -1;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (ch === "'" || ch === '"') {
      // Skip quoted text; a doubled quote is an escaped quote.
      i++;
      while (i < sql.length && !(sql[i] === ch && sql[i + 1] !== ch)) i += sql[i] === ch ? 2 : 1;
      continue;
    }
    if (ch !== "?") continue;
    let j = i + 1;
    while (j < sql.length && sql[j]! >= "0" && sql[j]! <= "9") j++;
    const num = j > i + 1 ? Number(sql.slice(i + 1, j)) : next + 1;
    if (num > next) next = num;
    if (num > max) max = num;
    if (num > limit && over < 0) over = i;
    i = j - 1;
  }
  return { count: max, offsetOverLimit: over };
}

interface Executed {
  sql: string;
  binds: unknown[];
}

interface Stmt extends Executed {
  bind(...args: unknown[]): Stmt;
  all(): Promise<{ results: unknown[] }>;
  run(): Promise<{ success: boolean }>;
}

// Just enough of the D1 surface for the chain: prepare/bind, all, run, and an
// atomic batch(). Like the deployed runtime it rejects a statement with more
// than D1_MAX_BOUND_PARAMS variables (a batch is rejected before anything in it
// runs) and a statement whose bound values do not match its placeholders.
function makeD1(sqlite: SqliteDb, executed: Executed[] = []): D1Database {
  const check = (sql: string, binds: unknown[]): void => {
    const { count, offsetOverLimit } = scanVariables(sql, D1_MAX_BOUND_PARAMS);
    if (offsetOverLimit >= 0) {
      throw new Error(`D1_ERROR: too many SQL variables at offset ${offsetOverLimit}: SQLITE_ERROR`);
    }
    if (binds.length !== count) {
      throw new Error(`D1_ERROR: statement has ${count} variables but ${binds.length} values were bound`);
    }
  };
  const stmt = (sql: string, binds: unknown[]): Stmt => ({
    sql,
    binds,
    bind: (...args: unknown[]) => stmt(sql, args),
    all: async () => {
      check(sql, binds);
      executed.push({ sql, binds });
      return { results: sqlite.prepare(sql).all(...(binds as never[])) };
    },
    run: async () => {
      check(sql, binds);
      executed.push({ sql, binds });
      sqlite.prepare(sql).run(...(binds as never[]));
      return { success: true };
    },
  });
  const db = {
    prepare: (sql: string) => stmt(sql, []),
    batch: async (stmts: Stmt[]) => {
      for (const s of stmts) check(s.sql, s.binds);
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) {
          executed.push({ sql: s.sql, binds: s.binds });
          sqlite.prepare(s.sql).run(...(s.binds as never[]));
          out.push({ success: true });
        }
        sqlite.exec("COMMIT");
        return out;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return db as unknown as D1Database;
}

function newSqlite(): SqliteDb {
  const sqlite = new DatabaseSync!(":memory:");
  for (const file of ["0001_init.sql", "0010_add_name_states.sql", "0011_add_name_diaspora.sql"]) {
    sqlite.exec(migration(file));
  }
  return sqlite;
}

const maxVariables = (executed: Executed[]): number =>
  Math.max(0, ...executed.map((e) => scanVariables(e.sql, D1_MAX_BOUND_PARAMS).count));

// ---- Fixture --------------------------------------------------------------

type Sex = "M" | "F";
interface Pair {
  name: string;
  sex: Sex;
  firstYear: number;
  peakYear: number;
  rows: StateCountRow[];
}

// 466 (name, sex) pairs, so the compute pages (200 pairs each) three times:
//  - Filler: enormous, evenly spread counts that set the per-state and national
//    birth denominators for both sexes;
//  - Hotname (F): concentrated in NM from 2000, reaching TX in 2002, so it has
//    an origin and a two-state spread;
//  - Tiny000..Tiny459: five births in one state-year, below every breakout guard;
//  - Legacy0..2: first recorded in 1880, so they get the "no observable origin"
//    result whatever their state counts are.
function buildPairs(): Pair[] {
  const states = ["AL", "NM", "TX"];
  const years = [2000, 2001, 2002, 2003];
  const pairs: Pair[] = [];

  for (const sex of ["F", "M"] as const) {
    const rows: StateCountRow[] = [];
    for (const year of years) for (const state of states) rows.push({ year, state, count: 100_000 });
    pairs.push({ name: "Filler", sex, firstYear: 1950, peakYear: 2000, rows });
  }

  const hotCounts: Record<string, number[]> = {
    NM: [400, 450, 500, 550],
    TX: [20, 20, 600, 650],
    AL: [20, 20, 20, 20],
  };
  const hot: StateCountRow[] = [];
  years.forEach((year, i) => {
    for (const state of states) hot.push({ year, state, count: hotCounts[state]![i]! });
  });
  pairs.push({ name: "Hotname", sex: "F", firstYear: 2000, peakYear: 2003, rows: hot });

  for (let i = 0; i < 460; i++) {
    pairs.push({
      name: `Tiny${String(i).padStart(3, "0")}`,
      sex: i % 2 ? "M" : "F",
      firstYear: 2001,
      peakYear: 2001,
      rows: [{ year: 2001, state: "TX", count: 5 }],
    });
  }
  for (let i = 0; i < 3; i++) {
    pairs.push({
      name: `Legacy${i}`,
      sex: "F",
      firstYear: 1880,
      peakYear: 1921,
      rows: [{ year: 2000, state: "NM", count: 60 }],
    });
  }
  return pairs;
}

function seed(sqlite: SqliteDb, pairs: Pair[]): void {
  const insertName = sqlite.prepare(
    `INSERT INTO names (name, name_lower, sex, first_year, last_year, peak_year, peak_count, total_count, status)
     VALUES (?, ?, ?, ?, 2025, ?, 1, 1, 'stable')`,
  );
  const insertState = sqlite.prepare(
    "INSERT INTO name_states (name, sex, year, state, count) VALUES (?, ?, ?, ?, ?)",
  );
  sqlite.exec("BEGIN");
  for (const p of pairs) {
    insertName.run(...([p.name, p.name.toLowerCase(), p.sex, p.firstYear, p.peakYear] as never[]));
    for (const r of p.rows) insertState.run(...([p.name, p.sex, r.year, r.state, r.count] as never[]));
  }
  sqlite.exec("COMMIT");
}

// The expected denominators and per-pair results, computed straight from the
// fixture with the pure function, independent of the D1 code under test.
function expectedFor(pairs: Pair[]): Map<string, ReturnType<typeof computeDiasporaForName>> {
  const totals: StateYearTotals = new Map();
  for (const p of pairs) for (const r of p.rows) addTotal(totals, r.state, p.sex, r.year, r.count);
  const out = new Map<string, ReturnType<typeof computeDiasporaForName>>();
  for (const p of pairs) out.set(`${p.name}|${p.sex}`, computeDiasporaForName(p.rows, totals, p.firstYear, p.sex));
  return out;
}

// Drive the chain the way the queue does: clear staging, load the denominators
// once, then one page per call following the cursor.
async function runChain(db: D1Database): Promise<number> {
  await clearDiasporaStaging(db);
  const totals = await loadStateYearTotals(db);
  let cursor: { name: string; sex: Sex } | null = null;
  let done = 0;
  let calls = 0;
  do {
    const r = await computeDiasporaChunk(db, cursor, 1, totals);
    done += r.namesDone;
    cursor = r.nextCursor;
    calls++;
  } while (cursor);
  assert.ok(calls >= 3, `expected the fixture to take several chain calls, took ${calls}`);
  return done;
}

interface DiasporaRow {
  name: string;
  sex: Sex;
  origin_state: string | null;
  origin_year: number | null;
  peak_national_year: number | null;
  spread_json: string;
  never_adopted: string;
  total_states: number;
  diffusion_years: number;
}

function readTable(sqlite: SqliteDb, table: string): DiasporaRow[] {
  return sqlite.prepare(`SELECT * FROM ${table}`).all() as DiasporaRow[];
}

// ---- Tests ----------------------------------------------------------------

test("the stand-in rejects what production rejected: the 500-variable diaspora INSERT fails at offset 519", { skip }, async () => {
  const sqlite = newSqlite();
  const db = makeD1(sqlite);
  // The statement the deployed worker built: 50 rows x 10 columns.
  const tuples = Array.from({ length: 50 }, () => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
  const sql = `INSERT OR REPLACE INTO name_diaspora_staging
         (name, name_lower, sex, origin_state, origin_year, peak_national_year,
          spread_json, never_adopted, total_states, diffusion_years)
       VALUES ${tuples}`;
  await assert.rejects(
    () => db.prepare(sql).bind(...Array.from({ length: 500 }, () => null)).run(),
    /too many SQL variables at offset 519: SQLITE_ERROR/,
  );
});

test("the stand-in accepts exactly D1_MAX_BOUND_PARAMS variables and rejects one more", { skip }, async () => {
  const sqlite = newSqlite();
  const db = makeD1(sqlite);
  const insert = (rows: number) =>
    db
      .prepare(
        "INSERT INTO name_states (name, sex, year, state, count) VALUES " +
          Array.from({ length: rows }, () => "(?, ?, ?, ?, ?)").join(","),
      )
      .bind(...Array.from({ length: rows }, (_, i) => [`N${i}`, "F", 2000, "TX", 5]).flat())
      .run();
  await insert(D1_MAX_BOUND_PARAMS / 5);
  await assert.rejects(() => insert(D1_MAX_BOUND_PARAMS / 5 + 1), /too many SQL variables/);
});

test("rowsPerStatement keeps rows x columns within the limit and refuses impossible rows", () => {
  assert.equal(rowsPerStatement(10), 10);
  assert.equal(rowsPerStatement(5), 20);
  assert.equal(rowsPerStatement(3), 33);
  assert.equal(rowsPerStatement(D1_MAX_BOUND_PARAMS), 1);
  for (const columns of [1, 2, 3, 5, 7, 10, 13, 33, 99, 100]) {
    assert.ok(rowsPerStatement(columns) * columns <= D1_MAX_BOUND_PARAMS, `columns=${columns}`);
  }
  assert.throws(() => rowsPerStatement(D1_MAX_BOUND_PARAMS + 1), RangeError);
  assert.throws(() => rowsPerStatement(0), RangeError);
  assert.throws(() => rowsPerStatement(2.5), RangeError);
});

test("diaspora chain: every statement stays within the variable limit and every row matches the pure function", { skip }, async () => {
  const pairs = buildPairs();
  const sqlite = newSqlite();
  seed(sqlite, pairs);
  const executed: Executed[] = [];
  const db = makeD1(sqlite, executed);

  const done = await runChain(db);
  assert.equal(done, pairs.length);

  // Packed to the ceiling, not over it.
  assert.equal(maxVariables(executed), D1_MAX_BOUND_PARAMS);

  const stored = readTable(sqlite, "name_diaspora_staging");
  assert.equal(stored.length, pairs.length);
  const expected = expectedFor(pairs);
  const byPair = new Map(stored.map((r) => [`${r.name}|${r.sex}`, r]));
  for (const p of pairs) {
    const key = `${p.name}|${p.sex}`;
    const got = byPair.get(key);
    const want = expected.get(key)!;
    assert.ok(got, `${key} was not written`);
    assert.equal(got.origin_state, want.originState, key);
    assert.equal(got.origin_year, want.originYear, key);
    assert.equal(got.peak_national_year, p.peakYear, key);
    assert.equal(got.spread_json, JSON.stringify(want.spread), key);
    assert.equal(got.never_adopted, JSON.stringify(want.neverAdopted), key);
    assert.equal(got.total_states, want.totalStates, key);
    assert.equal(got.diffusion_years, want.diffusionYears, key);
  }

  // The fixture exercises the interesting cases, not just the empty ones.
  const hot = byPair.get("Hotname|F")!;
  assert.equal(hot.origin_state, "NM");
  assert.equal(hot.origin_year, 2000);
  assert.deepEqual(
    (JSON.parse(hot.spread_json) as { state: string; year: number }[]).map((s) => [s.state, s.year]),
    [
      ["NM", 2000],
      ["TX", 2002],
    ],
  );
  assert.equal(byPair.get("Legacy0|F")!.origin_state, null);
  assert.equal((JSON.parse(byPair.get("Legacy0|F")!.never_adopted) as string[]).length, 51);
  assert.equal(byPair.get("Tiny000|F")!.origin_state, null);
});

test("diaspora chain: the terminal swap puts the result on the live table and leaves an empty staging table", { skip }, async () => {
  const pairs = buildPairs();
  const sqlite = newSqlite();
  seed(sqlite, pairs);
  const db = makeD1(sqlite);

  await runChain(db);
  await swapDiasporaStaging(db);

  assert.equal(readTable(sqlite, "name_diaspora").length, pairs.length);
  assert.equal(readTable(sqlite, "name_diaspora_staging").length, 0);
  const leftovers = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE name = 'name_diaspora_old'")
    .all();
  assert.equal(leftovers.length, 0);
});

test("a full state-rows message lands within the variable limit and is idempotent", { skip }, async () => {
  const sqlite = newSqlite();
  const executed: Executed[] = [];
  const db = makeD1(sqlite, executed);

  const rows: StateRow[] = Array.from({ length: STATE_CHUNK_ROWS }, (_, i) => ({
    name: `Name${String(i % 250).padStart(3, "0")}`,
    sex: i % 2 ? "M" : "F",
    year: 1990 + (i % 7),
    state: ["AL", "NM", "TX", "WA"][i % 4]!,
    count: 5 + i,
  }));
  // Rows are unique on the table's (name, sex, year, state) key.
  const unique = new Set(rows.map((r) => `${r.name}|${r.sex}|${r.year}|${r.state}`));
  assert.equal(unique.size, rows.length, "fixture rows must be unique");

  await insertStateRows(db, rows);
  assert.equal(executed.length, Math.ceil(rows.length / rowsPerStatement(5)));
  assert.equal(maxVariables(executed), D1_MAX_BOUND_PARAMS);
  const count = () => (sqlite.prepare("SELECT COUNT(*) AS c FROM name_states").get() as { c: number }).c;
  assert.equal(count(), rows.length);
  const sum = (sqlite.prepare("SELECT SUM(count) AS s FROM name_states").get() as { s: number }).s;
  assert.equal(
    sum,
    rows.reduce((a, r) => a + r.count, 0),
  );

  // A queue retry delivers the same message again: no duplicates, no error.
  await insertStateRows(db, rows);
  assert.equal(count(), rows.length);
});
