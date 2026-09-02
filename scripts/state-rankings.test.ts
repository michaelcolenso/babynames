#!/usr/bin/env tsx
// Exercises the state_year_rankings / state_year_totals writers and the
// readers that prefer them, against a real SQLite database through a minimal
// D1 shim — the same pattern as rankings.test.ts.
//
//   npm run test:state-rankings

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import {
  publishStateRankings,
  rebuildStateRankings,
  stateRankingsReady,
  retireStateRankings,
  revalidateStateRankings,
  allStateYearPairs,
  STATE_RANKINGS_PER_SEX_LIMIT,
} from "../packages/shared/src/state-rankings";
import {
  topByStateYear,
  getStateYearTotals,
  listStateDataYears,
  listStateTotalsForYear,
} from "../packages/shared/src/d1-queries";
import { stateToSlug, slugToState, ALL_STATES } from "../packages/shared/src/us-states-map";

// node:sqlite ships in Node 22+. The workflows pin Node 20 (see
// .github/workflows/validate.yml), where importing it throws
// ERR_UNKNOWN_BUILTIN_MODULE — resolve lazily and skip rather than failing
// the whole `npm test` run.
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
const MIGRATION = path.join(REPO, "migrations/0024_state_rankings.sql");

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

// Deterministic fixture: 2 states × 2 years, counts chosen so state ranks
// differ from each other and from the national order.
function seed(withStateTables: boolean): SqliteDb {
  const sqlite = new DatabaseSync!(":memory:");
  sqlite.exec(`
    CREATE TABLE name_states (
      name TEXT NOT NULL, sex TEXT NOT NULL CHECK (sex IN ('M','F')),
      year INTEGER NOT NULL, state TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY (name, sex, year, state));
    CREATE TABLE name_rankings_by_year (
      year INTEGER NOT NULL, sex TEXT NOT NULL CHECK (sex IN ('M','F')),
      rank INTEGER NOT NULL, name TEXT NOT NULL, count INTEGER NOT NULL,
      PRIMARY KEY (year, sex, rank));
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('data_version', 'v1');
    INSERT INTO name_states (name, sex, year, state, count) VALUES
      ('Ava','F',2023,'CA',500), ('Mia','F',2023,'CA',800),
      ('Leo','M',2023,'CA',300), ('Max','M',2023,'CA',600),
      ('Ava','F',2023,'TX',900), ('Mia','F',2023,'TX',100),
      ('Leo','M',2023,'TX',400), ('Max','M',2023,'TX',200),
      ('Ava','F',2024,'CA',700), ('Mia','F',2024,'CA',600),
      ('Leo','M',2024,'CA',900), ('Max','M',2024,'CA',100);
    INSERT INTO name_rankings_by_year (year, sex, rank, name, count) VALUES
      (2023,'F',1,'Ava',1400), (2023,'F',2,'Mia',900),
      (2023,'M',1,'Max',800), (2023,'M',2,'Leo',700);
  `);
  if (withStateTables) sqlite.exec(readFileSync(MIGRATION, "utf-8"));
  return sqlite;
}

const pairs = (years: number[]) =>
  ["CA", "TX"].flatMap((state) => years.map((year) => ({ state, year })));

test("slug helpers round-trip every state", () => {
  for (const state of ALL_STATES) {
    const slug = stateToSlug(state);
    assert.ok(slug.length > 0, `no slug for ${state}`);
    assert.equal(slugToState(slug), state);
  }
  assert.equal(stateToSlug("NY"), "new-york");
  assert.equal(slugToState("district-of-columbia"), "DC");
  assert.equal(slugToState("not-a-state"), "");
});

test("rebuildStateRankings writes one rank sequence per (state, year, sex)", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  const done = await rebuildStateRankings(db, pairs([2023]));
  assert.equal(done, 2);

  const rows = sqlite
    .prepare("SELECT state, year, sex, rank, name FROM state_year_rankings ORDER BY state, sex, rank")
    .all() as { state: string; sex: string; rank: number; name: string }[];
  assert.equal(rows.length, 8);
  // CA 2023 F: Mia 800 then Ava 500; TX 2023 F is the reverse order.
  assert.deepEqual(
    rows.filter((r) => r.state === "CA" && r.sex === "F").map((r) => [r.rank, r.name]),
    [[1, "Mia"], [2, "Ava"]],
  );
  assert.deepEqual(
    rows.filter((r) => r.state === "TX" && r.sex === "F").map((r) => [r.rank, r.name]),
    [[1, "Ava"], [2, "Mia"]],
  );
});

test("rebuildStateRankings also writes state_year_totals", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  await rebuildStateRankings(db, [{ state: "CA", year: 2023 }]);
  const totals = sqlite
    .prepare("SELECT births, names FROM state_year_totals WHERE state = 'CA' AND year = 2023")
    .get() as { births: number; names: number };
  assert.deepEqual(totals, { births: 2200, names: 4 });
});

test("rebuildStateRankings is idempotent and clears vacated ranks", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  await rebuildStateRankings(db, [{ state: "CA", year: 2023 }]);
  await rebuildStateRankings(db, [{ state: "CA", year: 2023 }]);
  const after = sqlite
    .prepare("SELECT COUNT(*) AS n FROM state_year_rankings WHERE state = 'CA' AND year = 2023")
    .get() as { n: number };
  assert.equal(after.n, 4);

  sqlite.exec("DELETE FROM name_states WHERE state = 'CA' AND year = 2023 AND name = 'Ava'");
  await rebuildStateRankings(db, [{ state: "CA", year: 2023 }]);
  const f = sqlite
    .prepare("SELECT rank, name FROM state_year_rankings WHERE state = 'CA' AND year = 2023 AND sex = 'F' ORDER BY rank")
    .all() as { rank: number; name: string }[];
  assert.deepEqual(
    f.map((r) => [r.rank, r.name]),
    [[1, "Mia"]],
  );
});

test("readers agree whether or not the state tables are published", { skip }, async () => {
  const populated = seed(true);
  await publishStateRankings(makeDb(populated), pairs([2023, 2024]), "v1");
  const withTables = makeDb(populated);
  const withoutTables = makeDb(seed(false));

  const [a, b] = await Promise.all([
    topByStateYear(withTables, "CA", 2023),
    topByStateYear(withoutTables, "CA", 2023),
  ]);
  assert.equal(a.length, 4);
  assert.deepEqual(
    a.map((r) => [r.sex, r.rank, r.name]),
    b.map((r) => [r.sex, r.rank, r.name]),
  );

  // Precomputed path joins the national rank; the live fallback leaves it null.
  const mia = a.find((r) => r.name === "Mia");
  assert.equal(mia?.nationalRank, 2);
  assert.equal(b.find((r) => r.name === "Mia")?.nationalRank ?? undefined, undefined);

  const [ta, tb] = await Promise.all([
    getStateYearTotals(withTables, "CA", 2023),
    getStateYearTotals(withoutTables, "CA", 2023),
  ]);
  assert.deepEqual(
    { births: ta?.births, names: ta?.names },
    { births: tb?.births, names: tb?.names },
  );

  const [ya, yb] = await Promise.all([
    listStateDataYears(withTables),
    listStateDataYears(withoutTables),
  ]);
  assert.deepEqual(ya, [2023, 2024]);
  assert.deepEqual(ya, yb);

  const grid = await listStateTotalsForYear(withTables, 2023);
  assert.equal(grid.length, 2);
  assert.equal(grid[0]?.state, "CA");
});

test("readiness gate follows the state_rankings_version marker", { skip }, async () => {
  const sqlite = seed(true);
  const db = makeDb(sqlite);
  assert.equal(await stateRankingsReady(db), false);
  await publishStateRankings(db, pairs([2023]), "v1");
  assert.equal(await stateRankingsReady(db), true);

  await retireStateRankings(db);
  assert.equal(await stateRankingsReady(db), false);
  await revalidateStateRankings(db, "v2");
  assert.equal(await stateRankingsReady(db), false);

  await publishStateRankings(db, pairs([2023]), "v1");
  await revalidateStateRankings(db, "v2");
  sqlite.exec("UPDATE meta SET value = 'v2' WHERE key = 'data_version'");
  assert.equal(await stateRankingsReady(db), true);
});

test("allStateYearPairs covers every state × every year", () => {
  const grid = allStateYearPairs([2023, 2024]);
  assert.equal(grid.length, ALL_STATES.length * 2);
  assert.ok(STATE_RANKINGS_PER_SEX_LIMIT >= 100);
});
