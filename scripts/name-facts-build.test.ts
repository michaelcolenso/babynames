import assert from "node:assert/strict";
import test from "node:test";

import {
  assembleCollections,
  buildFactsRows,
  emitSql,
  groupVariants,
  rankRarity,
  markCanonicalSex,
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
    // State data begins in 1910, and the per-state totals below roughly account
    // for the national births in that era — which is what the share divides by.
    stateEraFirstYear: 1910,
    stateTotals: new Map([
      // Marvel: 13,180 nationally, concentrated but nowhere near exclusive.
      ["Marvel|F", new Map([["WV", 7_000], ["OH", 4_000], ["PA", 2_000]])],
      // Elzada: 288 births from 1910 on, almost all of them in Vermont.
      ["Elzada|F", new Map([["VT", 270], ["NH", 10]])],
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
  // The percentile is the share of names strictly MORE common, so the rarest
  // name reads 5-of-6 rather than a synthetic 100. With real ties that matters:
  // the bottom 14% of male names share one total and must all read the same.
  assert.equal(bethzy.rarity_pct_sex, 83.33);
  assert.equal(bethzy.rarity_total_sex, females.length);
  assert.ok(bethzy.rarity_band === "ultra-rare");

  // Ranks are 1-based and never decrease down the list.
  const ranks = females.map((r) => r.rarity_rank_sex);
  assert.equal(ranks[0], 1);
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i]! >= ranks[i - 1]!);
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
  assert.equal(marvel.exclusive_state, null, "a 53% share is not exclusivity");
  assert.ok((marvel.top_state_share ?? 0) > 0.5 && (marvel.top_state_share ?? 0) < 0.6);

  const elzada = rows.find((r) => r.name === "Elzada")!;
  assert.equal(elzada.exclusive_state, "VT");
  assert.ok((elzada.top_state_share ?? 0) >= 0.9);

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
  const sql = emitSql(rows, assembleCollections(rows, { minYear: 1880, maxYear: YM }), "corpus-a");

  assert.equal((sql.match(/^BEGIN TRANSACTION;$/gm) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
  assert.ok(sql.indexOf("BEGIN TRANSACTION;") < sql.indexOf("COMMIT;"));
  // Re-runnable: the deletes must precede the inserts.
  assert.ok(sql.indexOf("DELETE FROM name_facts;") < sql.indexOf("INSERT INTO name_facts"));
  assert.ok(sql.indexOf("DELETE FROM name_collections;") < sql.indexOf("INSERT INTO name_collections"));
  // facts_version must be the version this build READ, not a SELECT of whatever
  // is live at seed time — otherwise applying a stale file after a newer ingest
  // relabels the old rows as current and verify-name-facts passes wrongly.
  assert.match(sql, /INSERT INTO meta \(key, value\) VALUES \('facts_version', 'corpus-a'\)/);
  assert.ok(
    !/SELECT 'facts_version', value FROM meta/.test(sql),
    "facts_version must not be copied from the live data_version at seed time",
  );
});

test("string literals are escaped, not concatenated raw", () => {
  const rows = buildFactsRows(new Map([["O'Neal|M", new Map([[1990, 40]])]]), YM, {
    analysisYear: 2026,
    sourceDataVersion: null,
    catalysts: new Map([["o'neal|M", { year: 1992, title: "Shaq's rookie year", type: "sport" }]]),
  });
  const sql = emitSql(rows, assembleCollections(rows, { minYear: 1880, maxYear: YM }), "corpus-a");
  assert.match(sql, /'o''neal'/);
  assert.match(sql, /'Shaq''s rookie year'/);
  // Every quote in the file must be part of a balanced pair once doubles are
  // removed — the failure mode that produced a truncated blog seed file.
  const stripped = sql.replace(/''/g, "");
  assert.equal((stripped.match(/'/g) ?? []).length % 2, 0, "unbalanced quote in emitted SQL");
});

test("an empty corpus emits a valid no-op transaction rather than broken SQL", () => {
  const sql = emitSql([], [], "corpus-a");
  assert.match(sql, /BEGIN TRANSACTION;/);
  assert.match(sql, /COMMIT;/);
  assert.ok(!sql.includes("VALUES\n;"), "emitted an INSERT with no rows");
});

test("names with identical totals get identical rarity facts", () => {
  // The alphabetical tie-break decides sort order, but it must not leak into
  // the rarity claim: two names with the same lifetime total are equally rare
  // and their pages must say the same thing.
  const base = build()[0]!;
  const rows: NameFacts[] = [
    { ...base, name: "Big", name_lower: "big", sex: "F", total_count: 900 },
    { ...base, name: "Zeta", name_lower: "zeta", sex: "F", total_count: 5 },
    { ...base, name: "Alpha", name_lower: "alpha", sex: "F", total_count: 5 },
    { ...base, name: "Mid", name_lower: "mid", sex: "F", total_count: 5 },
  ];
  rankRarity(rows);
  const tied = rows.filter((r) => r.total_count === 5);
  assert.equal(new Set(tied.map((r) => r.rarity_rank_sex)).size, 1, "tied names got different ranks");
  assert.equal(new Set(tied.map((r) => r.rarity_pct_sex)).size, 1, "tied names got different percentiles");
  assert.equal(new Set(tied.map((r) => r.rarity_band)).size, 1, "tied names got different bands");
  // The percentile is the share strictly MORE common — one name of four here.
  assert.equal(tied[0]!.rarity_pct_sex, 25);
  assert.equal(rows.find((r) => r.name === "Big")!.rarity_pct_sex, 0);
});

test("the canonical sex is the one /name/:name/ resolves to", () => {
  const base = build()[0]!;
  const rows: NameFacts[] = [
    { ...base, name: "Ailany", name_lower: "ailany", sex: "M", total_count: 18, is_one_and_done: 1 },
    { ...base, name: "Ailany", name_lower: "ailany", sex: "F", total_count: 11_160, is_one_and_done: 0 },
  ];
  markCanonicalSex(rows);
  assert.equal(rows.find((r) => r.sex === "F")!.is_canonical_sex, 1);
  assert.equal(rows.find((r) => r.sex === "M")!.is_canonical_sex, 0);

  // Ties go to male, matching `total(m) >= total(f)` in the name route. 124
  // spellings in the live corpus have equal totals, and source ordering puts
  // the female row first — so an insertion-order tie-break would attach every
  // one of their claims to the sex the page does not display.
  const tied: NameFacts[] = [
    { ...base, name: "Jaime", name_lower: "jaime", sex: "F", total_count: 500 },
    { ...base, name: "Jaime", name_lower: "jaime", sex: "M", total_count: 500 },
  ];
  markCanonicalSex(tied);
  assert.equal(tied.find((r) => r.sex === "M")!.is_canonical_sex, 1);
  assert.equal(tied.find((r) => r.sex === "F")!.is_canonical_sex, 0);

  // …and the minority-sex row must not carry a collection claim, since the
  // link would open a page about a name with 11,160 births.
  const picked = assembleCollections(rows, { minYear: 1880, maxYear: YM });
  assert.ok(!picked.some((p) => p.slug === "one-year-wonders"));
});
