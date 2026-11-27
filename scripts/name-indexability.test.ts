// Name pages below the sitemap gate render noindex,follow, and the page-level
// gate must agree with the sitemap SQL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { classify } from "../packages/shared/src/classify";
import { listIndexableNames } from "../packages/shared/src/d1-queries";
import { isIndexableName, isIndexableNameRow } from "../packages/shared/src/name-indexability";
import { renderFullPage } from "../packages/shared/src/render-name";
import type { NameRecord, NameRow } from "../packages/shared/src/schema";

function row(partial: Partial<NameRow>): NameRow {
  return {
    id: 0, name: "X", name_lower: "x", sex: "F", first_year: 1990, last_year: 2025, peak_year: 2000,
    peak_count: 0, total_count: 0, status: "stable", decline_pct: null, latest_count: 0,
    prev_decade: null, curr_decade: null, growth_x: null,
    ...partial,
  };
}

test("thin names fail the gate and strong names pass it", () => {
  // /name/Sayara/ in the audit: 6 lifetime births.
  assert.equal(isIndexableNameRow(row({ total_count: 6, peak_count: 6, latest_count: 6, status: "rising" })), false);
  assert.equal(isIndexableNameRow(row({ total_count: 400_000, peak_count: 20_000, latest_count: 15_000, curr_decade: 90_000, status: "stable" })), true);
  // The page is judged by the name's strongest sex row, as the sitemap is.
  const weak = row({ sex: "M", total_count: 20, peak_count: 8, latest_count: 2 });
  const strong = row({ sex: "F", total_count: 5_000, peak_count: 300, latest_count: 60, status: "stable" });
  assert.equal(isIndexableName([weak, strong]), true);
  assert.equal(isIndexableName([weak]), false);
  assert.equal(isIndexableName([]), false);
});

test("the page-level gate matches the sitemap SQL on the same rows", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE names (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_lower TEXT NOT NULL, sex TEXT NOT NULL,
    first_year INTEGER NOT NULL, last_year INTEGER NOT NULL, peak_year INTEGER NOT NULL,
    peak_count INTEGER NOT NULL, total_count INTEGER NOT NULL, status TEXT NOT NULL,
    decline_pct REAL, latest_count INTEGER NOT NULL DEFAULT 0, prev_decade INTEGER,
    curr_decade INTEGER, growth_x REAL, UNIQUE(name, sex))`);

  // Deterministic spread around every threshold in the gate.
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const statuses = ["stable", "rising", "endangered", "extinct", "fading", "emerging", "comeback"] as const;
  const totals = [5, 9, 299, 300, 301, 999, 1000, 4999, 5000, 20_000];
  const peaks = [5, 39, 40, 49, 50, 99, 100, 499, 500, 2_000];
  const latests = [0, 9, 10, 19, 20, 49, 50, 300];
  const decades = [null, 0, 49, 50, 99, 100, 249, 250, 4_000];
  const growths = [null, 0, 1.49, 1.5, 2.99, 3, 8];

  const insert = sqlite.prepare(`INSERT INTO names (id, name, name_lower, sex, first_year, last_year, peak_year,
    peak_count, total_count, status, latest_count, curr_decade, growth_x) VALUES (?, ?, ?, ?, 1950, 2025, 2000, ?, ?, ?, ?, ?, ?)`);
  const byName = new Map<string, NameRow[]>();
  let id = 0;
  for (let i = 0; i < 3_000; i++) {
    const lower = `n${i}`;
    // Two-sex names insert the M row first, the reverse of the F-first order the
    // name page reads rows in, and half of them tie on total and peak, so the
    // tie-breaker has to agree between the two selectors.
    const sexes = rand() < 0.3 ? (["M", "F"] as const) : ([pick(["F", "M"] as const)] as const);
    const tie = rand() < 0.5;
    const rows: NameRow[] = [];
    for (const sex of sexes) {
      const r = row({
        id: ++id, name: `N${i}`, name_lower: lower, sex,
        total_count: tie && rows[0] ? rows[0].total_count : pick(totals),
        peak_count: tie && rows[0] ? rows[0].peak_count : pick(peaks),
        latest_count: pick(latests),
        status: pick(statuses), curr_decade: pick(decades), growth_x: pick(growths),
      });
      insert.run(r.id, r.name, r.name_lower, r.sex, r.peak_count, r.total_count, r.status, r.latest_count, r.curr_decade, r.growth_x);
      rows.push(r);
    }
    byName.set(lower, [...rows].sort((a, b) => a.sex.localeCompare(b.sex)));
  }

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return { all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) }) };
        },
      };
    },
  };
  const fromSql = new Set((await listIndexableNames(db as never, 49_900)).map((n) => n.name_lower));
  const fromTs = new Set([...byName].filter(([, rows]) => isIndexableName(rows)).map(([lower]) => lower));

  assert.ok(fromSql.size > 100 && fromSql.size < byName.size - 100, `fixture should straddle the gate (${fromSql.size})`);
  assert.deepEqual([...fromTs].filter((n) => !fromSql.has(n)), [], "page says indexable, sitemap says no");
  assert.deepEqual([...fromSql].filter((n) => !fromTs.has(n)), [], "sitemap includes a page marked noindex");
});

test("name pages below the gate render noindex,follow", () => {
  const series: Record<number, number> = { 2023: 5, 2024: 6, 2025: 7 };
  const record: NameRecord = { name: "Sayara", sex: "F", ym: 1880, yM: 2025, series };
  const cls = classify({ series, yM: 2025 })!;
  const canonical = "https://nobodynamed.com/name/Sayara/";
  assert.match(renderFullPage(record, cls, { canonical, noindex: true }), /<meta name="robots" content="noindex,follow">/);
  assert.doesNotMatch(renderFullPage(record, cls, { canonical }), /name="robots"/);
});
