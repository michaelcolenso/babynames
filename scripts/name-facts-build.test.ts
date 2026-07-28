import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleCollections,
  buildFactsRows,
  emitSql,
  groupVariants,
  rankRarity,
} from "./build-name-facts";
import type { NameFacts } from "../packages/shared/src/schema";

const YM = 2025;

/** A tiny but structurally realistic corpus: one giant name, one mid name, a
 *  spelling family, a one-year wonder, and a sub-ten persistent name. */
function corpus(): Map<string, Map<number, number>> {
  const m = new Map<string, Map<number, number>>();
  const put = (key: string, entries: [number, number][]) => m.set(key, new Map(entries));
  const flat = (from: number, to: number, n: number): [number, number][] => {
    const out: [number, number][] = [];
    for (let y = from; y <= to; y++) out.push([y, n]);
    return out;
  };

  put("Michael|M", flat(1900, YM, 20_000));
  put("Marvel|F", [...flat(1912, 1952, 300), ...flat(1953, 1974, 40)]);
  put("Caitlin|F", flat(1975, YM, 900));
  put("Katelyn|F", flat(1985, YM, 300));
  put("Kaitlyn|F", flat(1988, YM, 120));
  put("Bethzy|F", [[1998, 7]]);
  put("Elzada|F", flat(1900, 1945, 8));
  return m;
}

function build(): NameFacts[] {
  return buildFactsRows(corpus(), YM, {
    analysisYear: 2026,
    sourceDataVersion: "test",
    catalysts: new Map([["marvel|F", { year: 1931, title: "Marvel Comics debut", type: "media" }]]),
    stateTotals: new Map([
      ["Marvel|F", new Map([["WV", 900], ["OH", 400], ["PA", 300]])],
      ["Elzada|F", new Map([["VT", 340], ["NH", 10]])],
    ]),
  });
}

test("every pair in the corpus produces exactly one facts row", () => {
  const rows = build();
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map((r) => `${r.name_lower}|${r.sex}`)).size, 7);
});

test("rarity rank is a global sort, and the percentile inverts it", () => {
  const rows = build();
  const byName = new Map(rows.map((r) => [r.name, r]));
  const michael = byName.get("Michael")!;
  const bethzy = byName.get("Bethzy")!;

  assert.equal(michael.rarity_rank_all, 1, "the largest name should rank first overall");
  assert.equal(michael.rarity_rank_sex, 1);
  assert.equal(michael.rarity_pct_sex, 0, "the most common name is not rare at all");
  assert.equal(michael.rarity_band, "ubiquitous");

  // Rarest within F is the single-year name.
  const females = rows.filter((r) => r.sex === "F").sort((a, b) => a.rarity_rank_sex - b.rarity_rank_sex);
  assert.equal(females.at(-1)!.name, "Bethzy");
  assert.equal(bethzy.rarity_pct_sex, 100);
  assert.equal(bethzy.rarity_total_sex, females.length);
  assert.ok(bethzy.rarity_band === "ultra-rare");

  // Ranks within a sex are dense and 1-based.
  assert.deepEqual(
    females.map((r) => r.rarity_rank_sex),
    females.map((_, i) => i + 1),
  );
});

test("spelling families are grouped and the dominant spelling is marked primary", () => {
  const rows = build();
  const family = rows.filter((r) => ["Caitlin", "Katelyn", "Kaitlyn"].includes(r.name));
  assert.equal(new Set(family.map((r) => r.variant_key)).size, 1, "family split across keys");
  for (const row of family) assert.equal(row.variant_count, 3);
  assert.deepEqual(
    family.filter((r) => r.variant_is_primary === 1).map((r) => r.name),
    ["Caitlin"],
  );
  // A name with no relatives is its own primary, family of one.
  const solo = rows.find((r) => r.name === "Bethzy")!;
  assert.equal(solo.variant_count, 1);
  assert.equal(solo.variant_is_primary, 1);
});

test("spelling families do not merge across sexes", () => {
  const rows: NameFacts[] = [
    { ...build()[0]!, name: "Jaime", name_lower: "jaime", sex: "M", variant_key: "jm", total_count: 50 },
    { ...build()[0]!, name: "Jaime", name_lower: "jaime", sex: "F", variant_key: "jm", total_count: 40 },
  ];
  groupVariants(rows);
  assert.equal(rows[0]!.variant_count, 1);
  assert.equal(rows[1]!.variant_count, 1);
  assert.equal(rows[0]!.variant_is_primary, 1);
  assert.equal(rows[1]!.variant_is_primary, 1);
});

test("state totals become concentration facts", () => {
  const rows = build();
  const marvel = rows.find((r) => r.name === "Marvel")!;
  assert.equal(marvel.top_state, "WV");
  assert.equal(marvel.states_seen, 3);
  assert.equal(marvel.exclusive_state, null, "56% is not exclusivity");

  const elzada = rows.find((r) => r.name === "Elzada")!;
  assert.equal(elzada.exclusive_state, "VT");

  // A name with no state data at all must not invent geography.
  const michael = rows.find((r) => r.name === "Michael")!;
  assert.equal(michael.top_state, null);
  assert.equal(michael.top_state_share, null);
  assert.equal(michael.states_seen, null);
});

test("catalysts are denormalized onto the matching row only", () => {
  const rows = build();
  assert.equal(rows.find((r) => r.name === "Marvel")!.catalyst_year, 1931);
  assert.equal(rows.find((r) => r.name === "Marvel")!.catalyst_title, "Marvel Comics debut");
  assert.equal(rows.find((r) => r.name === "Michael")!.catalyst_title, null);
});

test("collection membership is ranked densely from 1 within each slug", () => {
  const members = assembleCollections(build(), { minYear: 1880, maxYear: YM });
  assert.ok(members.length > 0);
  const bySlug = new Map<string, number[]>();
  for (const m of members) {
    const list = bySlug.get(m.slug) ?? [];
    list.push(m.rankIn);
    bySlug.set(m.slug, list);
  }
  for (const [slug, ranks] of bySlug) {
    assert.deepEqual(
      [...ranks].sort((a, b) => a - b),
      ranks.map((_, i) => i + 1),
      `${slug} has non-dense ranks`,
    );
  }
  // The corpus was constructed to land in these.
  assert.ok(bySlug.has("one-year-wonders"));
  assert.ok(bySlug.has("only-in-vermont"));
  assert.ok(bySlug.has("famous-name-effects"));
});

test("a member never appears twice in the same collection", () => {
  const members = assembleCollections(build(), { minYear: 1880, maxYear: YM });
  const seen = new Set<string>();
  for (const m of members) {
    const pk = `${m.slug}|${m.nameLower}|${m.sex}`;
    assert.ok(!seen.has(pk), `duplicate primary key ${pk}`);
    seen.add(pk);
  }
});

test("emitted SQL is one balanced, idempotent transaction", () => {
  const rows = build();
  const sql = emitSql(rows, assembleCollections(rows, { minYear: 1880, maxYear: YM }));

  assert.equal((sql.match(/^BEGIN TRANSACTION;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.ok(sql.indexOf("BEGIN TRANSACTION;") < sql.indexOf("COMMIT;"));
  // Re-runnable: the deletes must precede the inserts.
  assert.ok(sql.indexOf("DELETE FROM name_facts;") < sql.indexOf("INSERT INTO name_facts"));
  assert.ok(sql.indexOf("DELETE FROM name_collections;") < sql.indexOf("INSERT INTO name_collections"));
  assert.match(sql, /INSERT INTO meta \(key, value\) SELECT 'facts_version'/);
});

test("string literals are escaped, not concatenated raw", () => {
  const rows = buildFactsRows(new Map([["O'Neal|M", new Map([[1990, 40]])]]), YM, {
    analysisYear: 2026,
    sourceDataVersion: null,
    catalysts: new Map([["o'neal|M", { year: 1992, title: "Shaq's rookie year", type: "sport" }]]),
  });
  const sql = emitSql(rows, assembleCollections(rows, { minYear: 1880, maxYear: YM }));
  assert.match(sql, /'o''neal'/);
  assert.match(sql, /'Shaq''s rookie year'/);
  // Every quote in the file must be part of a balanced pair once doubles are
  // removed — the failure mode that produced a truncated blog seed file.
  const stripped = sql.replace(/''/g, "");
  assert.equal((stripped.match(/'/g) ?? []).length % 2, 0, "unbalanced quote in emitted SQL");
});

test("an empty corpus emits a valid no-op transaction rather than broken SQL", () => {
  const sql = emitSql([], []);
  assert.match(sql, /BEGIN TRANSACTION;/);
  assert.match(sql, /COMMIT;/);
  assert.ok(!sql.includes("VALUES\n;"), "emitted an INSERT with no rows");
});

test("rankRarity is stable for names with identical totals", () => {
  const base = build()[0]!;
  const rows: NameFacts[] = [
    { ...base, name: "Zeta", name_lower: "zeta", sex: "F", total_count: 100 },
    { ...base, name: "Alpha", name_lower: "alpha", sex: "F", total_count: 100 },
  ];
  rankRarity(rows);
  assert.equal(rows.find((r) => r.name === "Alpha")!.rarity_rank_sex, 1);
  assert.equal(rows.find((r) => r.name === "Zeta")!.rarity_rank_sex, 2);
});
