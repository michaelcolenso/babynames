#!/usr/bin/env tsx
// The national refresh (rows -> year-totals -> finalize) is the Worker's annual
// data load. Its multi-row INSERTs were sized for local SQLite, not for D1, which
// rejects any statement binding more than 100 variables:
//
//   insertRowChunk     100 rows x  5 = 500 variables
//   upsertYearTotals    50 rows x  3 = 150
//   finalize, names     50 rows x 15 = 750
//   finalize, years    100 rows x  4 = 400
//
// These tests run the real pipeline against a real SQLite database behind a D1
// stand-in that enforces the documented per-statement limits
// (scripts/lib/d1-limit-standin.ts), and check what lands in the tables against
// an oracle computed straight from the fixture.
//
//   npm run test:ingest-limits

import test from "node:test";
import assert from "node:assert/strict";
import type { D1Database } from "@cloudflare/workers-types";
import { D1_MAX_BOUND_PARAMS, rowsPerStatement } from "../packages/shared/src/d1-chunk";
import { classify } from "../packages/shared/src/classify";
import { encodeSpark } from "../packages/shared/src/spark-blob";
import { CHUNK_ROWS, type ChunkRow } from "../apps/ingest-worker/src/chunks";
import { finalize } from "../apps/ingest-worker/src/compute";
import {
  clearStagingForRun,
  ensureStaging,
  insertRowChunk,
  upsertYearTotals,
} from "../apps/ingest-worker/src/upsert";
import {
  D1_MAX_SQL_BYTES,
  D1_MAX_VALUE_BYTES,
  makeD1,
  maxSqlBytes,
  maxValueBytes,
  maxVariables,
  openSqlite,
  skip,
  type Executed,
  type SqliteDb,
} from "./lib/d1-limit-standin";
import {
  YM,
  YMAX,
  buildNationalSeries,
  rowsByYear,
  yearTotalsOf,
  type NameSeries,
} from "./lib/ingest-national-fixture";

const NATIONAL_MIGRATIONS = [
  "0001_init.sql",
  "0010_add_name_states.sql",
  "0022_name_rankings.sql",
  "0023_viz_payloads.sql",
  "0024_state_rankings.sql",
];

const RUN_ID = "run-national-test";
const DATA_VERSION = "11111111-2222-3333-4444-555555555555";

interface Pipeline {
  sqlite: SqliteDb;
  executed: Executed[];
  all: NameSeries[];
  result: { namesInserted: number; rowsInserted: number };
}

// The messages runIngest sends, minus the queue: one `rows` message per
// <= CHUNK_ROWS rows of a year, then `year-totals`. `finalize` follows.
async function loadRawRows(db: D1Database, all: NameSeries[]): Promise<void> {
  await ensureStaging(db);
  await clearStagingForRun(db, RUN_ID);
  const byYear = rowsByYear(all);
  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    const rows = byYear.get(year)!;
    for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
      await insertRowChunk(db, RUN_ID, year, rows.slice(i, i + CHUNK_ROWS));
    }
  }
  await upsertYearTotals(db, yearTotalsOf(all));
}

const runFinalize = (db: D1Database) =>
  finalize(db, { runId: RUN_ID, ym: YM, yM: YMAX, dataVersion: DATA_VERSION });

async function runPipeline(all: NameSeries[]): Promise<Pipeline> {
  const sqlite = openSqlite(NATIONAL_MIGRATIONS);
  const executed: Executed[] = [];
  const db = makeD1(sqlite, executed);
  await loadRawRows(db, all);
  const result = await runFinalize(db);
  return { sqlite, executed, all, result };
}

// One full pipeline run over the standard fixture, shared by the tests that only
// read its outcome.
let shared: Promise<Pipeline> | null = null;
const pipeline = (): Promise<Pipeline> => (shared ??= runPipeline(buildNationalSeries()));

// ---- Oracle ---------------------------------------------------------------

const minYear = (series: Record<number, number>): number => Math.min(...Object.keys(series).map(Number));
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");
const pairKey = (name: string, sex: string): string => `${name}|${sex}`;

interface NameRow {
  name: string;
  name_lower: string;
  sex: string;
  first_year: number;
  last_year: number;
  peak_year: number;
  peak_count: number;
  total_count: number;
  status: string;
  decline_pct: number | null;
  latest_count: number;
  prev_decade: number | null;
  curr_decade: number | null;
  growth_x: number | null;
  spark_blob: Uint8Array;
  t_decline: string;
  t_growth: string;
  t_blob: string;
}

const NAME_COLUMNS = `name, name_lower, sex, first_year, last_year, peak_year, peak_count, total_count,
  status, decline_pct, latest_count, prev_decade, curr_decade, growth_x, spark_blob,
  typeof(decline_pct) AS t_decline, typeof(growth_x) AS t_growth, typeof(spark_blob) AS t_blob`;

function assertNamesMatchOracle(rows: NameRow[], all: NameSeries[]): void {
  assert.equal(rows.length, all.length);
  const byPair = new Map(rows.map((r) => [pairKey(r.name, r.sex), r]));
  assert.equal(byPair.size, all.length, "(name, sex) is unique");
  for (const { name, sex, series } of all) {
    const key = pairKey(name, sex);
    const got = byPair.get(key);
    assert.ok(got, `${key} is missing from names`);
    const want = classify({ series, yM: YMAX })!;
    assert.equal(got.name_lower, name.toLowerCase(), key);
    assert.equal(got.first_year, want.firstYear, key);
    assert.equal(got.last_year, want.lastYear, key);
    assert.equal(got.peak_year, want.peakYear, key);
    assert.equal(got.peak_count, want.peakCount, key);
    assert.equal(got.total_count, want.totalCount, key);
    assert.equal(got.status, want.status, key);
    assert.equal(got.decline_pct, want.declinePct, key);
    assert.equal(got.latest_count, want.latestCount, key);
    assert.equal(got.prev_decade, want.prevDecadeTotal, key);
    assert.equal(got.curr_decade, want.currDecadeTotal, key);
    assert.equal(got.growth_x, want.growthX, key);
    assert.equal(hex(got.spark_blob), hex(encodeSpark(series, minYear(series), YMAX)), `${key} spark_blob`);
    // Same storage classes as the bound-parameter path produced: REAL columns
    // hold REAL (or NULL) whatever the JSON looked like, and the sparkline is a BLOB.
    assert.equal(got.t_decline, want.declinePct === null ? "null" : "real", `${key} decline_pct type`);
    assert.equal(got.t_growth, want.growthX === null ? "null" : "real", `${key} growth_x type`);
    assert.equal(got.t_blob, "blob", `${key} spark_blob type`);
  }
}

function assertYearsMatchOracle(sqlite: SqliteDb, all: NameSeries[]): void {
  const stored = sqlite
    .prepare("SELECT n.name, n.sex, y.year, y.count FROM name_years y JOIN names n ON n.id = y.name_id")
    .all() as { name: string; sex: string; year: number; count: number }[];
  const got = new Set(stored.map((r) => `${r.name}|${r.sex}|${r.year}|${r.count}`));
  const want = new Set<string>();
  for (const { name, sex, series } of all) {
    for (const [year, count] of Object.entries(series)) want.add(`${name}|${sex}|${year}|${count}`);
  }
  assert.equal(stored.length, want.size, "name_years row count");
  assert.equal(got.size, want.size, "no duplicate name_years rows");
  for (const row of want) assert.ok(got.has(row), `name_years is missing ${row}`);
}

const count = (sqlite: SqliteDb, table: string): number =>
  (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

// ---- insertRowChunk / upsertYearTotals ------------------------------------

test("a full national rows message lands within the variable limit, in one batch, and is idempotent", { skip }, async () => {
  const sqlite = openSqlite(NATIONAL_MIGRATIONS);
  const executed: Executed[] = [];
  const db = makeD1(sqlite, executed);
  await ensureStaging(db);

  const rows: ChunkRow[] = Array.from({ length: CHUNK_ROWS }, (_, i) => ({
    name: `Name${String(i).padStart(4, "0")}`,
    sex: i % 2 ? "M" : "F",
    count: 5 + i,
  }));
  executed.length = 0;
  await insertRowChunk(db, RUN_ID, 1999, rows);

  assert.equal(executed.length, Math.ceil(CHUNK_ROWS / rowsPerStatement(5)));
  assert.equal(maxVariables(executed), D1_MAX_BOUND_PARAMS);
  assert.equal(count(sqlite, "name_year_raw_staging"), CHUNK_ROWS);
  const sum = (sqlite.prepare("SELECT SUM(count) AS s FROM name_year_raw_staging").get() as { s: number }).s;
  assert.equal(
    sum,
    rows.reduce((a, r) => a + r.count, 0),
  );

  // A queue retry delivers the same message again: no duplicates, no error.
  await insertRowChunk(db, RUN_ID, 1999, rows);
  assert.equal(count(sqlite, "name_year_raw_staging"), CHUNK_ROWS);
});

test("year totals land within the variable limit and a re-run updates them in place", { skip }, async () => {
  const sqlite = openSqlite(NATIONAL_MIGRATIONS);
  const executed: Executed[] = [];
  const db = makeD1(sqlite, executed);

  // Every (year, sex) SSA publishes: 146 years x 2 sexes.
  const totals = Array.from({ length: (YMAX - YM + 1) * 2 }, (_, i) => ({
    year: YM + (i >> 1),
    sex: i % 2 ? ("M" as const) : ("F" as const),
    total: 1_000_000 + i,
  }));
  await upsertYearTotals(db, totals);

  assert.equal(executed.length, Math.ceil(totals.length / rowsPerStatement(3)));
  assert.ok(maxVariables(executed) <= D1_MAX_BOUND_PARAMS);
  assert.equal(count(sqlite, "year_totals"), totals.length);

  await upsertYearTotals(db, totals.map((t) => ({ ...t, total: t.total + 1 })));
  assert.equal(count(sqlite, "year_totals"), totals.length);
  const sum = (sqlite.prepare("SELECT SUM(total) AS s FROM year_totals").get() as { s: number }).s;
  assert.equal(
    sum,
    totals.reduce((a, t) => a + t.total + 1, 0),
  );
});

// ---- finalize -------------------------------------------------------------

test("national pipeline: no statement exceeds D1's variable, SQL-length or value-size limits", { skip }, async () => {
  const { executed } = await pipeline();
  assert.ok(executed.length > 100, "the pipeline ran");
  assert.ok(maxVariables(executed) <= D1_MAX_BOUND_PARAMS, `max variables ${maxVariables(executed)}`);
  assert.ok(maxSqlBytes(executed) <= D1_MAX_SQL_BYTES, `max SQL bytes ${maxSqlBytes(executed)}`);
  // The aggregation ships whole pages as JSON parameters; keep them far from the
  // 2 MB ceiling, not just under it.
  assert.ok(
    maxValueBytes(executed) <= D1_MAX_VALUE_BYTES / 4,
    `largest bound value ${maxValueBytes(executed)} bytes`,
  );
});

test("finalize: names, year rows and sparklines match what the fixture says, with the same storage types", { skip }, async () => {
  const { sqlite, all, result } = await pipeline();
  const rows = sqlite.prepare(`SELECT ${NAME_COLUMNS} FROM names`).all() as NameRow[];
  assertNamesMatchOracle(rows, all);
  assertYearsMatchOracle(sqlite, all);

  const rowTotal = all.reduce((a, s) => a + Object.keys(s.series).length, 0);
  assert.equal(result.namesInserted, all.length);
  assert.equal(result.rowsInserted, rowTotal);

  // The fixture reaches every classification and the NULL growth_x case.
  const statuses = new Set(rows.map((r) => r.status));
  for (const status of ["rising", "extinct", "endangered", "stable", "declining"]) {
    assert.ok(statuses.has(status), `fixture has no ${status} name`);
  }
  assert.ok(rows.some((r) => r.growth_x === null), "fixture has a NULL growth_x");
  // Names that break naive quoting survive intact.
  for (const [name, sex] of [["O'Brien", "F"], ['Quote"Name', "M"], ["Back\\slash", "F"], ["Zoë", "F"], ["Z\u{1F600}", "M"]]) {
    assert.ok(rows.some((r) => r.name === name && r.sex === sex), `${name} (${sex})`);
  }
  assert.ok(rows.some((r) => r.name === "Jordan" && r.sex === "F"));
  assert.ok(rows.some((r) => r.name === "Jordan" && r.sex === "M"));
});

test("finalize: staging is swapped onto live and re-created empty, and the run publishes its caches", { skip }, async () => {
  const { sqlite, all } = await pipeline();
  assert.equal(count(sqlite, "names_staging"), 0);
  assert.equal(count(sqlite, "name_years_staging"), 0);
  const leftovers = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE name IN ('names_old', 'name_years_old')")
    .all();
  assert.equal(leftovers.length, 0);
  assert.equal(count(sqlite, "names"), all.length);

  const meta = Object.fromEntries(
    (sqlite.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[]).map((r) => [
      r.key,
      r.value,
    ]),
  );
  assert.equal(meta.rankings_version, DATA_VERSION);
  assert.ok(count(sqlite, "name_rankings_by_year") > 0, "rankings were rebuilt");

  // publishVizPayloads is best-effort inside finalize (it logs and carries on),
  // so check that it actually wrote all four under the limits.
  const viz = sqlite.prepare("SELECT key, source_version FROM viz_payloads ORDER BY key").all() as {
    key: string;
    source_version: string;
  }[];
  assert.deepEqual(
    viz.map((v) => v.key),
    ["concentration", "name-survival", "suffix-waves", "terminal-letters"],
  );
  for (const v of viz) assert.equal(v.source_version, DATA_VERSION, v.key);

  const totals = sqlite.prepare("SELECT year, sex, total FROM year_totals").all() as {
    year: number;
    sex: string;
    total: number;
  }[];
  const want = yearTotalsOf(all);
  assert.equal(totals.length, want.length);
  const wantByKey = new Map(want.map((t) => [`${t.year}:${t.sex}`, t.total]));
  for (const t of totals) assert.equal(t.total, wantByKey.get(`${t.year}:${t.sex}`), `${t.year}:${t.sex}`);
});

test("finalize needs a handful of statements per page, not one per few rows", { skip }, async () => {
  const { executed, all } = await pipeline();
  const names = executed.filter((e) => /INSERT INTO names_staging/.test(e.sql));
  const years = executed.filter((e) => /INTO name_years_staging/.test(e.sql));
  const yearRows = all.reduce((a, s) => a + Object.keys(s.series).length, 0);
  const pages = Math.ceil(all.length / 200);

  // One names statement per page; the year rows travel a few thousand at a time.
  assert.equal(names.length, pages);
  assert.ok(years.length >= Math.ceil(yearRows / 5000), `${years.length} year statements`);
  assert.ok(years.length <= Math.ceil(yearRows / 5000) + pages, `${years.length} year statements`);
  // Each of them binds a single JSON parameter.
  for (const e of [...names, ...years]) {
    assert.equal(e.binds.length, 1, e.sql.slice(0, 60));
    assert.equal(typeof e.binds[0], "string");
  }
  // For scale: sized to the limit as plain VALUES lists, the same data would need
  // this many statements (one per 6 names, one per 25 year rows).
  const asValues = Math.ceil(all.length / rowsPerStatement(15)) + Math.ceil(yearRows / rowsPerStatement(4));
  assert.ok(names.length + years.length < asValues / 10, `${names.length + years.length} vs ${asValues}`);
});

test("finalize retried after a failure partway through converges on the same tables", { skip }, async () => {
  const all = buildNationalSeries();
  const sqlite = openSqlite(NATIONAL_MIGRATIONS);
  let armed = false;
  let seen = 0;
  const db = makeD1(sqlite, [], {
    beforeRun: (e) => {
      // Fail the third page's names statement, after two pages are in staging.
      if (armed && /INSERT INTO names_staging/.test(e.sql) && ++seen === 3) {
        throw new Error("injected: D1 went away");
      }
    },
  });
  await loadRawRows(db, all);

  armed = true;
  await assert.rejects(runFinalize(db), /injected: D1 went away/);
  assert.ok(count(sqlite, "names_staging") > 0, "the failed run left partial staging behind");
  assert.equal(count(sqlite, "names"), 0, "nothing reached live");

  // The queue redelivers the finalize message.
  armed = false;
  const result = await runFinalize(db);
  assert.equal(result.namesInserted, all.length);
  const rows = sqlite.prepare(`SELECT ${NAME_COLUMNS} FROM names`).all() as NameRow[];
  assertNamesMatchOracle(rows, all);
  assertYearsMatchOracle(sqlite, all);
});

test("finalize's page query seeks by (run_id, name, sex) instead of reading the whole run for every page", { skip }, async () => {
  const { sqlite, executed, all } = await pipeline();
  const pageQueries = executed.filter((e) => /WITH ordered AS/.test(e.sql));
  // 459 pairs: three pages of rows, then the query that comes back empty.
  assert.equal(pageQueries.length, Math.ceil(all.length / 200) + 1);

  // One plan for the first page (no cursor) and one for a cursor page.
  for (const e of [pageQueries[0]!, pageQueries[1]!]) {
    const plan = (
      sqlite.prepare("EXPLAIN QUERY PLAN " + e.sql).all(...(e.binds as never[])) as { detail: string }[]
    ).map((r) => r.detail);
    const text = plan.join("\n");
    assert.match(text, /COVERING INDEX name_year_raw_staging_by_name \(run_id=\?/, text);
    assert.match(text, /SEARCH r USING INDEX name_year_raw_staging_by_name \(run_id=\? AND name=\? AND sex=\?\)/, text);
    // Neither the primary key nor a table scan: both read the whole run.
    assert.doesNotMatch(text, /sqlite_autoindex_name_year_raw_staging/, text);
    assert.doesNotMatch(text, /SCAN name_year_raw_staging/, text);
  }
  assert.match(
    (sqlite.prepare("EXPLAIN QUERY PLAN " + pageQueries[1]!.sql).all(...(pageQueries[1]!.binds as never[])) as { detail: string }[])
      .map((r) => r.detail)
      .join("\n"),
    /\(name,sex\)>\(\?,\?\)/,
    "the cursor page is a range scan from the cursor",
  );
});

test("finalize pages correctly when a page boundary falls between a name's two sexes", { skip }, async () => {
  // 199 names, then Jordan F as the 200th pair (the end of page one) and Jordan M
  // as the 201st (the start of page two).
  const all: NameSeries[] = [];
  for (let i = 0; i < 199; i++) {
    all.push({ name: `A${String(i).padStart(3, "0")}`, sex: "F", series: { 2020: 10 + i, 2025: 20 + i } });
  }
  all.push({ name: "Jordan", sex: "F", series: { 2010: 50, 2025: 60 } });
  all.push({ name: "Jordan", sex: "M", series: { 2010: 70, 2025: 80 } });
  all.push({ name: "Zed", sex: "M", series: { 2025: 30 } });

  const { sqlite, executed, result } = await runPipeline(all);
  const pageQueries = executed.filter((e) => /WITH ordered AS/.test(e.sql));
  assert.deepEqual(pageQueries[1]!.binds, [RUN_ID, "Jordan", "F"], "page two starts after Jordan F");
  assert.equal(result.namesInserted, all.length);
  assertNamesMatchOracle(sqlite.prepare(`SELECT ${NAME_COLUMNS} FROM names`).all() as NameRow[], all);
  assertYearsMatchOracle(sqlite, all);
});
