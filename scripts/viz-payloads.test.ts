#!/usr/bin/env tsx
// Covers the viz_payloads builders (pure shaping) and the read/publish
// contract, against real SQLite through a minimal D1 shim.
//
//   npm run test:viz-payloads

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import {
  buildConcentration,
  buildTerminalLetters,
  buildSuffixWaves,
  buildNameSurvival,
  collectTerminalLetters,
  collectSuffixWaves,
  collectNameSurvival,
  computeVizPayload,
  readVizPayload,
  writeVizPayload,
  getVizPayload,
  revalidateVizPayloads,
  VIZ_KEYS,
  type TerminalLettersResponse,
  type SuffixWavesResponse,
  type NameSurvivalResponse,
} from "../packages/shared/src/viz-payloads";

// node:sqlite is Node 22+; the repo targets Node 20. Resolve lazily and skip.
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
const MIGRATION = path.join(REPO, "migrations/0023_viz_payloads.sql");

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
  return {
    prepare: (sql: string) => stmt(sql, []),
    batch: async (stmts: { all: () => Promise<unknown> }[]) => {
      const out = [];
      for (const s of stmts) out.push(await s.all());
      return out;
    },
  } as unknown as D1Database;
}

// Two years, four names. Endings chosen so terminal letters and 3-char suffixes
// are both non-trivial: Ava/Mia end in A, Leo/Max differ.
function seed(): SqliteDb {
  const sqlite = new DatabaseSync!(":memory:");
  sqlite.exec(`
    CREATE TABLE names (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_lower TEXT NOT NULL,
      sex TEXT NOT NULL, first_year INTEGER NOT NULL, last_year INTEGER,
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
      (1,'Ava','ava','F',2000,2001,2001,900,1400),
      (2,'Mia','mia','F',2000,2001,2000,800,900),
      (3,'Leo','leo','M',2000,2001,2001,700,1000),
      (4,'Max','max','M',2000,2001,2000,600,700);
    INSERT INTO name_years (name_id, year, count) VALUES
      (1,2000,500),(2,2000,800),(3,2000,300),(4,2000,600),
      (1,2001,900),(2,2001,100),(3,2001,700),(4,2001,100);
    INSERT INTO year_totals (year, sex, total) VALUES
      (2000,'F',1300),(2000,'M',900),(2001,'F',1000),(2001,'M',800);
  `);
  sqlite.exec(readFileSync(MIGRATION, "utf-8"));
  return sqlite;
}

test("buildConcentration maps snake_case rows onto the response contract", { skip }, () => {
  const body = buildConcentration(
    [
      { year: 2000, sex: "F", hhi: 0.5, top1_share: 0.6, top10_share: 0.9, unique_names: 2, total: 1300 },
    ],
    1880,
    2000,
  );
  assert.deepEqual(body, {
    ym: 1880,
    yM: 2000,
    data: [{ year: 2000, sex: "F", hhi: 0.5, top1Share: 0.6, top10Share: 0.9, uniqueNames: 2, total: 1300 }],
  });
});

test("terminal letters normalize to per-year shares and drop non-A-Z endings", { skip }, async () => {
  const db = makeDb(seed());
  const rows = await collectTerminalLetters(db);
  // Ava + Mia both end in A; Leo ends in O, Max in X.
  const body = buildTerminalLetters(rows, 1880, 2001);
  assert.deepEqual(body.letters, ["A", "O", "X"]);
  assert.deepEqual(body.years, [2000, 2001]);

  const ai = body.letters.indexOf("A");
  assert.equal(body.Fraw[0]![ai], 1300); // 500 + 800 in 2000
  assert.equal(body.F[0]![ai], 1); // all female births end in A
  const oi = body.letters.indexOf("O");
  const xi = body.letters.indexOf("X");
  assert.equal(body.Mraw[0]![oi], 300);
  assert.equal(body.Mraw[0]![xi], 600);
  // 300 / 900 male births in 2000, rounded to 4dp.
  assert.equal(body.M[0]![oi], 0.3333);

  // A letter with no births in a year stays 0 rather than undefined.
  assert.equal(body.Fraw[1]![oi], 0);

  const nonAlpha = buildTerminalLetters(
    [...rows, { year: 2000, sex: "F", letter: "-", count: 99 }],
    1880,
    2001,
  );
  assert.deepEqual(nonAlpha.letters, ["A", "O", "X"]);
});

test("suffix waves rank by all-time births and grid only the top N", { skip }, async () => {
  const db = makeDb(seed());
  const data = await collectSuffixWaves(db, 2);
  // All-time: AVA 1400, MIA 900, LEO 1000, MAX 700 → top 2 are AVA and LEO.
  assert.deepEqual(data.topSuffixes, ["AVA", "LEO"]);

  const body = buildSuffixWaves(data, 1880, 2001);
  assert.deepEqual(body.suffixes, ["AVA", "LEO"]);
  assert.deepEqual(body.years, [2000, 2001]);
  assert.deepEqual(body.F[0], [500, 0]); // Ava 2000, no female LEO
  assert.deepEqual(body.M[1], [0, 700]); // Leo 2001
});

test("survival rates are alive/cohort size, offset from the debut decade", { skip }, async () => {
  const db = makeDb(seed());
  // yM = 2006 keeps the cohort cutoff (yM - 5 = 2001) inclusive of these names.
  const data = await collectNameSurvival(db, 2006);
  const body = buildNameSurvival(data, 1880, 2006);

  // All four names debut in 2000 → cohort 2000, two per sex.
  const f2000 = body.data.filter((p) => p.decade === 2000 && p.sex === "F");
  assert.deepEqual(
    f2000.map((p) => [p.offset, p.alive, p.cohortSize, p.rate]),
    [
      [0, 2, 2, 1],
      [1, 2, 2, 1],
    ],
  );
  assert.ok(body.data.every((p) => p.offset >= 0 && p.offset <= 140));
});

test("a payload is only served when it matches the live data_version", { skip }, async () => {
  const sqlite = seed();
  const db = makeDb(sqlite);

  assert.equal(await readVizPayload(db, "concentration", "v1"), null);

  const live = await computeVizPayload(db, "concentration", 1880, 2001);
  await writeVizPayload(db, "concentration", live, "v1");
  assert.deepEqual(await readVizPayload(db, "concentration", "v1"), live);

  // Stamped for a dataset that is no longer the live one.
  assert.equal(await readVizPayload(db, "concentration", "v2"), null);

  // …and the endpoint helper falls back to computing rather than serving stale.
  assert.deepEqual(await getVizPayload(db, "concentration", "v2", 1880, 2001), live);

  // Carrying it across a bump that did not touch name_years restores the hit.
  await revalidateVizPayloads(db, "v1", "v2");
  assert.deepEqual(await readVizPayload(db, "concentration", "v2"), live);
});

test("stored and live-computed payloads are identical for every key", { skip }, async () => {
  const sqlite = seed();
  const db = makeDb(sqlite);
  for (const key of VIZ_KEYS) {
    const live = await computeVizPayload(db, key, 1880, 2001);
    await writeVizPayload(db, key, live, "v1");
    const stored = await getVizPayload(db, key, "v1", 1880, 2001);
    assert.deepEqual(stored, JSON.parse(JSON.stringify(live)), `${key} round-trip`);
  }
});

test("writeVizPayload replaces in place rather than accumulating rows", { skip }, async () => {
  const sqlite = seed();
  const db = makeDb(sqlite);
  await writeVizPayload(db, "concentration", { a: 1 }, "v1");
  await writeVizPayload(db, "concentration", { a: 2 }, "v2");
  const rows = sqlite.prepare("SELECT COUNT(*) AS n FROM viz_payloads").get() as { n: number };
  assert.equal(rows.n, 1);
  assert.deepEqual(await readVizPayload(db, "concentration", "v2"), { a: 2 });
});
