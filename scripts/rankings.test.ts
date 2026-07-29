#!/usr/bin/env tsx
// Exercises the name_rankings_by_year writer + the readers that prefer it,
// against a real SQLite database through a minimal D1 shim.
//
//   npm run test:rankings

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import {
  publishRankings,
  rebuildRankings,
  rankingsReady,
  retireRankings,
  revalidateRankings,
  RANKINGS_PER_SEX_LIMIT,
} from "../packages/shared/src/rankings";
import { topByYear, topBySpecificYear, riverNames } from "../packages/shared/src/d1-queries";

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

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const MIGRATION = path.join(REPO, "migrations/0022_name_rankings.sql");

// Just enough of the D1 surface for the queries under test: prepare/bind and
// all/first/run, plus batch() executed sequentially.
function makeDb(sqlite: SqliteDb): D1Database {
  const stmt = (sql: string, binds: unknown[]) => ({
    bind: (...args: unknown[]) => stmt(sql, args),
    all: async () => ({ results: sqlite.prepare(sql).all(...(binds as never[])) }),
    first: async () => sqlite.prepare(sql).get(...(binds as never[])) ?? null,
    run: async () => {
      sqlite.prepare(sql).run(...(binds as never[]));
      return { success: true };
    },
  });
  const db = {
    prepare: (sql: string) => stmt(sql, []),
    batch: async (stmts: { all: () => Promise<unknown> }[]) => {
      const out = [];
      for (const s of stmts) out.push(await s.all());
      return out;
    },
  };
  return db as unknown as D1Database;
}

// Deterministic fixture: 3 years, 4 names, counts chosen so ranks differ per
// year and per sex.
function seed(withRankingsTable: boolean): SqliteDb {
  const sqlite = new DatabaseSync!(":memory:");
  sqlite.exec(`
    CREATE TABLE names (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_lower TEXT NOT NULL,
      sex TEXT NOT NULL, first_year INTEGER, last_year INTEGER,
      peak_year INTEGER, peak_count INTEGER, total_count INTEGER,
      UNIQUE(name, sex));
    CREATE TABLE name_years (
      name_id INTEGER NOT NULL, year INTEGER NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY (name_id, year));
    CREATE TABLE year_totals (
      year INTEGER NOT NULL, sex TEXT NOT NULL, total INTEGER NOT NULL,
      PRIMARY KEY (year, sex));
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('data_version', 'v1');
    INSERT INTO names (id, name, name_lower, sex, first_year, last_year, peak_year, peak_count, total_count) VALUES
      (1,'Ava','ava','F',2000,2002,2001,900,1700),
      (2,'Mia','mia','F',2000,2002,2000,800,1500),
      (3,'Leo','leo','M',2000,2002,2002,700,1400),
      (4,'Max','max','M',2000,2002,2000,600,900);
    INSERT INTO name_years (name_id, year, count) VALUES
      (1,2000,500),(2,2000,800),(3,2000,300),(4,2000,600),
      (1,2001,900),(2,2001,700),(3,2001,400),(4,2001,200),
      (1,2002,300),(2,2002,100),(3,2002,700),(4,2002,100);
    INSERT INTO year_totals (year, sex, total) VALUES
      (2000,'F',1300),(2000,'M',900),(2001,'F',1600),(2001,'M',600),
      (2002,'F',400),(2002,'M',800);
  `);
  if (withRankingsTable) sqlite.exec(readFileSync(MIGRATION, "utf-8"));
  return sqlite;
}

test("rebuildRankings writes one rank sequence per (year, sex)", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  const done = await rebuildRankings(db, [2000, 2001, 2002]);
  assert.equal(done, 3);

  const rows = sqlite
    .prepare("SELECT year, sex, rank, name, count FROM name_rankings_by_year ORDER BY year, sex, rank")
    .all() as { year: number; sex: string; rank: number; name: string; count: number }[];
  assert.equal(rows.length, 12);
  // 2000 F: Mia 800 then Ava 500; 2000 M: Max 600 then Leo 300.
  assert.deepEqual(
    rows.filter((r) => r.year === 2000).map((r) => [r.sex, r.rank, r.name]),
    [
      ["F", 1, "Mia"],
      ["F", 2, "Ava"],
      ["M", 1, "Max"],
      ["M", 2, "Leo"],
    ],
  );
  // 2002 M is the one year Leo leads.
  assert.deepEqual(
    rows.filter((r) => r.year === 2002 && r.sex === "M").map((r) => [r.rank, r.name]),
    [
      [1, "Leo"],
      [2, "Max"],
    ],
  );
});

test("rebuildRankings is idempotent and clears ranks that no longer exist", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  await rebuildRankings(db, [2000]);
  await rebuildRankings(db, [2000]);
  const after = sqlite
    .prepare("SELECT COUNT(*) AS n FROM name_rankings_by_year WHERE year = 2000")
    .get() as { n: number };
  assert.equal(after.n, 4);

  // Drop a name from 2000 and rebuild: the vacated rank 2 must not survive.
  sqlite.exec("DELETE FROM name_years WHERE year = 2000 AND name_id = 1");
  await rebuildRankings(db, [2000]);
  const f = sqlite
    .prepare("SELECT rank, name FROM name_rankings_by_year WHERE year = 2000 AND sex = 'F' ORDER BY rank")
    .all() as { rank: number; name: string }[];
  assert.deepEqual(
    f.map((r) => [r.rank, r.name]),
    [[1, "Mia"]],
  );
});

test("readers agree whether or not the rankings table is published", { skip }, async () => {
  const populated = seed(true);
  await publishRankings(makeDb(populated), [2000, 2001, 2002], "v1");
  const withTable = makeDb(populated);
  // No rankings table at all — every reader must fall back to the live query.
  const withoutTable = makeDb(seed(false));

  assert.deepEqual(await topByYear(withTable, 1), await topByYear(withoutTable, 1));
  assert.deepEqual(
    await topBySpecificYear(withTable, 2001, 2),
    await topBySpecificYear(withoutTable, 2001, 2),
  );
  assert.deepEqual(await riverNames(withTable, 1), await riverNames(withoutTable, 1));

  // Sanity-check the shared answer rather than only that the two paths match.
  const top = await topByYear(withTable, 1);
  assert.deepEqual(
    top.map((r) => [r.year, r.sex, r.name]),
    [
      [2000, "F", "Mia"],
      [2000, "M", "Max"],
      [2001, "F", "Ava"],
      [2001, "M", "Leo"],
      [2002, "F", "Ava"],
      [2002, "M", "Leo"],
    ],
  );
});

test("a request deeper than the stored cap falls back to the live query", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  await publishRankings(db, [2001], "v1", 1); // store only rank 1
  const deep = await topBySpecificYear(db, 2001, RANKINGS_PER_SEX_LIMIT + 1);
  // The live query still returns both ranks per sex despite the shallow table.
  assert.deepEqual(
    deep.map((r) => [r.sex, r.rank, r.name]),
    [
      ["F", 1, "Ava"],
      ["F", 2, "Mia"],
      ["M", 1, "Leo"],
      ["M", 2, "Max"],
    ],
  );
});

test("a half-built table is not served until it is published", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  // Simulate a backfill (or ingest rebuild) that has only reached 2000: rows
  // exist, but no marker was published.
  await rebuildRankings(db, [2000]);
  assert.equal(await rankingsReady(db), false);

  // The reader must not serve the one year that happens to be present — that
  // truncated response would be edge-cached for a week.
  const top = await topByYear(db, 1);
  assert.deepEqual(
    top.map((r) => r.year),
    [2000, 2000, 2001, 2001, 2002, 2002],
  );

  await publishRankings(db, [2000, 2001, 2002], "v1");
  assert.equal(await rankingsReady(db), true);
  assert.deepEqual(await topByYear(db, 1), top);
});

test("an in-flight rebuild retires the cache for the duration", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  await publishRankings(db, [2000, 2001, 2002], "v1");
  assert.equal(await rankingsReady(db), true);

  await retireRankings(db);
  assert.equal(await rankingsReady(db), false);
});

test("a data_version bump invalidates the cache unless it is carried over", { skip }, async () => {
  const bumped = seed(true);
  const a = makeDb(bumped);
  await publishRankings(a, [2000, 2001, 2002], "v1");
  // A bump that changed the underlying data must strand the old marker.
  bumped.exec("UPDATE meta SET value = 'v2' WHERE key = 'data_version'");
  assert.equal(await rankingsReady(a), false);

  // A bump that did not touch name_years (the diaspora recompute) carries the
  // marker forward instead of stranding a still-valid cache.
  const carried = seed(true);
  const b = makeDb(carried);
  await publishRankings(b, [2000, 2001, 2002], "v1");
  await revalidateRankings(b, "v2");
  carried.exec("UPDATE meta SET value = 'v2' WHERE key = 'data_version'");
  assert.equal(await rankingsReady(b), true);
});

test("revalidateRankings does not resurrect an unpublished cache", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  await rebuildRankings(db, [2000]); // rows, but never published
  await revalidateRankings(db, "v2");
  sqlite.exec("UPDATE meta SET value = 'v2' WHERE key = 'data_version'");
  assert.equal(await rankingsReady(db), false);
});
