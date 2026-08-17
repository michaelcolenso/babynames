#!/usr/bin/env tsx
// Pins the bounded two-sided scans in listRelatedNames / listStatusNeighbors /
// listPeakEraNeighbors to the `ORDER BY ABS(...)` queries they replaced.
//
// Those rewrites are a read-volume optimisation (see
// migrations/20260817T190000_name_page_read_indexes.sql): they must return
// exactly what the old single-statement queries returned, including tie-break
// order, or the name page's discovery modules silently change. This test keeps
// the original SQL as the oracle and compares row-for-row over a randomised
// corpus, so a future edit to either the SQL or the merge comparators fails
// here rather than in production.
//
//   npm run test:name-neighbors

import test from "node:test";
import assert from "node:assert/strict";
import type { D1Database } from "@cloudflare/workers-types";
import {
  listRelatedNames,
  listStatusNeighbors,
  listPeakEraNeighbors,
} from "../packages/shared/src/d1-queries";
import type { Sex, Status } from "../packages/shared/src/schema";

// node:sqlite ships in Node 22+. The repo still targets Node 20 (see
// .github/workflows/deploy-cloudflare.yml), where importing it throws
// ERR_UNKNOWN_BUILTIN_MODULE — so resolve it lazily and skip rather than
// failing the whole `npm test` run on the older runtime.
type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): { all(...p: never[]): unknown[]; get(...p: never[]): unknown; run(...p: never[]): unknown };
};
let DatabaseSync: (new (p: string) => SqliteDb) | null = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = null;
}
const skip = DatabaseSync ? false : "requires node:sqlite (Node 22+)";

function makeDb(sqlite: SqliteDb): D1Database {
  const stmt = (sql: string, binds: unknown[]) => ({
    bind: (...args: unknown[]) => stmt(sql, args),
    all: async () => ({ results: sqlite.prepare(sql).all(...(binds as never[])) }),
    first: async () => sqlite.prepare(sql).get(...(binds as never[])) ?? null,
  });
  return { prepare: (sql: string) => stmt(sql, []) } as unknown as D1Database;
}

const STATUSES: Status[] = ["extinct", "declining", "stable", "rising", "endangered"];
const SEXES: Sex[] = ["M", "F"];

// Mirrors the production shape closely enough to exercise every branch of the
// merge: dense clusters of equal peak_year and equal total_count (so tie-breaks
// matter), names on both sides of every probe, and rows that fail the OR
// thresholds so the walk has to skip past them.
function seed(): D1Database {
  const sqlite = new DatabaseSync!(":memory:");
  sqlite.exec(`
    CREATE TABLE names (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_lower TEXT NOT NULL,
      sex TEXT NOT NULL CHECK (sex IN ('M','F')),
      first_year INTEGER NOT NULL, last_year INTEGER NOT NULL,
      peak_year INTEGER NOT NULL, peak_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL, status TEXT NOT NULL,
      decline_pct REAL, latest_count INTEGER NOT NULL DEFAULT 0,
      prev_decade INTEGER, curr_decade INTEGER, growth_x REAL, spark_blob BLOB,
      UNIQUE(name, sex));
    CREATE INDEX names_sex_peak_year        ON names(sex, peak_year);
    CREATE INDEX names_sex_status_peak_year ON names(sex, status, peak_year);
    CREATE INDEX names_sex_status_total     ON names(sex, status, total_count);`);

  const insert = sqlite.prepare(
    `INSERT INTO names (id,name,name_lower,sex,first_year,last_year,peak_year,peak_count,
                        total_count,status,latest_count,curr_decade)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  // Deterministic LCG so a failure is reproducible.
  let seedValue = 20260817;
  const rnd = () => (seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let id = 1; id <= 4000; id++) {
    const name = `Name${String(id).padStart(4, "0")}`;
    // Coarse buckets on purpose: many rows share a peak_year and a total_count,
    // which is where a naive merge would diverge from the oracle.
    const peakYear = 1900 + Math.floor(rnd() * 40) * 3;
    const peakCount = Math.floor(rnd() * 20) * 50;
    const totalCount = Math.floor(rnd() * 30) * 250;
    insert.run(
      id, name, name.toLowerCase(), SEXES[Math.floor(rnd() * 2)]!,
      peakYear - 5, peakYear + 5, peakYear, peakCount, totalCount,
      STATUSES[Math.floor(rnd() * STATUSES.length)]!,
      Math.floor(rnd() * 60), Math.floor(rnd() * 300),
    );
  }
  return makeDb(sqlite);
}

// The pre-rewrite statements, kept verbatim as the oracle.
// listRelatedNames' original ordering ended at `total_count DESC`, leaving rows
// tied on both keys in arbitrary scan order. The rewrite appends `name` to make
// the merge deterministic, so the oracle carries the same final tie-break —
// otherwise this test would be asserting against an order SQLite never promised.
const ORACLE_RELATED = `SELECT name, sex, status, peak_year, peak_count, total_count
   FROM names
  WHERE name_lower <> ?1 AND sex = ?2 AND status = ?3
    AND (total_count >= 1000 OR peak_count >= 100)
  ORDER BY ABS(peak_year - ?4), total_count DESC, name
  LIMIT ?5`;

const ORACLE_STATUS = `SELECT name, sex, status, peak_year, peak_count, total_count, latest_count
   FROM names
  WHERE name_lower <> ?1 AND sex = ?2 AND status = ?3
    AND (total_count >= 750 OR peak_count >= 75 OR latest_count >= 25
         OR COALESCE(curr_decade, 0) >= 100)
  ORDER BY ABS(total_count - ?4), peak_count DESC, latest_count DESC, name
  LIMIT ?5`;

const ORACLE_ERA = `SELECT name, sex, status, peak_year, peak_count, total_count, latest_count
   FROM names
  WHERE name_lower <> ?1 AND sex = ?2 AND peak_year BETWEEN ?3 AND ?4
    AND (total_count >= 750 OR peak_count >= 75 OR latest_count >= 25)
  ORDER BY ABS(peak_year - ?5), peak_count DESC, total_count DESC, name
  LIMIT ?6`;

// node:sqlite returns null-prototype rows; compare by value.
const shape = (rows: readonly Record<string, unknown>[]) =>
  rows.map((r) => `${r.name}|${r.sex}|${r.peak_year}|${r.peak_count}|${r.total_count}`).join(",");

async function oracle(db: D1Database, sql: string, binds: unknown[]) {
  const r = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  return r.results ?? [];
}

test("bounded neighbour scans match the ORDER BY ABS() queries they replaced", { skip }, async () => {
  const db = seed();
  let seedValue = 99;
  const rnd = () => (seedValue = (seedValue * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let i = 0; i < 300; i++) {
    const sex = SEXES[Math.floor(rnd() * 2)]!;
    const status = STATUSES[Math.floor(rnd() * STATUSES.length)]!;
    const peakYear = 1895 + Math.floor(rnd() * 135);
    const totalCount = Math.floor(rnd() * 8000);
    const nameLower = `name${String(1 + Math.floor(rnd() * 4000)).padStart(4, "0")}`;
    const probe = { sex, status, peakYear, totalCount, nameLower };

    assert.equal(
      shape(await listRelatedNames(db, nameLower, sex, status, peakYear, 6)),
      shape(await oracle(db, ORACLE_RELATED, [nameLower, sex, status, peakYear, 6])),
      `listRelatedNames diverged for ${JSON.stringify(probe)}`,
    );

    assert.equal(
      shape(await listStatusNeighbors(db, nameLower, sex, status, totalCount, 4)),
      shape(await oracle(db, ORACLE_STATUS, [nameLower, sex, status, totalCount, 4])),
      `listStatusNeighbors diverged for ${JSON.stringify(probe)}`,
    );

    assert.equal(
      shape(await listPeakEraNeighbors(db, nameLower, sex, peakYear, 4)),
      shape(await oracle(db, ORACLE_ERA, [nameLower, sex, peakYear - 8, peakYear + 8, peakYear, 4])),
      `listPeakEraNeighbors diverged for ${JSON.stringify(probe)}`,
    );
  }
});

test("neighbour scans exclude the current name and respect the limit", { skip }, async () => {
  const db = seed();
  const related = await listRelatedNames(db, "name0001", "F", "stable", 1950, 6);
  assert.ok(related.length <= 6);
  assert.ok(!related.some((r) => r.name.toLowerCase() === "name0001"));

  const era = await listPeakEraNeighbors(db, "name0001", "F", 1950, 4);
  assert.ok(era.length <= 4);
  assert.ok(!era.some((r) => r.name.toLowerCase() === "name0001"));

  const neighbors = await listStatusNeighbors(db, "name0001", "F", "stable", 5000, 4);
  assert.ok(neighbors.length <= 4);
  assert.ok(!neighbors.some((r) => r.name.toLowerCase() === "name0001"));
});

// The merge must never return the same (name, sex) twice, even though the two
// directional scans can both surface a row sitting exactly on the probe value.
test("neighbour scans do not return duplicates", { skip }, async () => {
  const db = seed();
  for (const status of STATUSES) {
    for (const sex of SEXES) {
      for (const year of [1900, 1950, 2010]) {
        const rows = await listPeakEraNeighbors(db, "zzz", sex, year, 8);
        const keys = rows.map((r) => `${r.name}|${r.sex}`);
        assert.equal(new Set(keys).size, keys.length, `duplicate in peak-era ${sex} ${year}`);

        const related = await listRelatedNames(db, "zzz", sex, status, year, 12);
        const relatedKeys = related.map((r) => `${r.name}|${r.sex}`);
        assert.equal(new Set(relatedKeys).size, relatedKeys.length, `duplicate in related ${sex} ${status}`);
      }
    }
  }
});
