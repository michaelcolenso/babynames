import assert from "node:assert/strict";
import test from "node:test";

import { classify } from "../packages/shared/src/classify";
import { renderFullPage } from "../packages/shared/src/render-name";
import type { CollectionMembership, NameFacts, NameRecord, VariantSibling } from "../packages/shared/src/schema";

const YM = 2025;

function series(entries: [number, number][]): Record<number, number> {
  return Object.fromEntries(entries);
}

const MARVEL_SERIES = series([
  ...Array.from({ length: 41 }, (_, i): [number, number] => [1912 + i, 300 - i * 4]),
  [1974, 6],
]);

function record(overrides: Partial<NameRecord> = {}): NameRecord {
  return {
    name: "Marvel",
    sex: "F",
    ym: 1880,
    yM: YM,
    series: MARVEL_SERIES,
    ...overrides,
  };
}

function facts(overrides: Partial<NameFacts> = {}): NameFacts {
  return {
    name: "Marvel",
    name_lower: "marvel",
    sex: "F",
    total_count: 4_120,
    peak_year: 1912,
    peak_count: 300,
    latest_count: 0,
    status: "extinct",
    rarity_rank_sex: 21_004,
    rarity_total_sex: 22_000,
    rarity_pct_sex: 95.5,
    rarity_rank_all: 44_512,
    rarity_band: "rare",
    first_year: 1912,
    last_year: 1974,
    years_recorded: 42,
    span_years: 63,
    max_annual: 300,
    gap_years_max: 0,
    gap_start_year: null,
    gap_end_year: null,
    is_one_and_done: 0,
    is_current_debut: 0,
    is_sub_ten: 0,
    is_verge: 0,
    spike_year: null,
    spike_ratio: null,
    spike_baseline: null,
    spike_post_ratio: null,
    spike_fellback_year: null,
    spike_fellback_ratio: null,
    comeback_gap: null,
    comeback_year: null,
    comeback_strength: null,
    top_state: "WV",
    top_state_share: 0.34,
    exclusive_state: null,
    states_seen: 12,
    is_canonical_sex: 1,
    variant_key: "mrvl",
    variant_count: 3,
    variant_is_primary: 1,
    catalyst_year: null,
    catalyst_title: null,
    catalyst_type: null,
    source_data_version: "test",
    analysis_year: 2026,
    ...overrides,
  };
}

const VARIANTS: VariantSibling[] = [
  { name: "Marvella", sex: "F", total_count: 900, status: "extinct", peak_year: 1920 },
  { name: "Marvelle", sex: "F", total_count: 400, status: "extinct", peak_year: 1918 },
];

const MEMBERSHIPS: CollectionMembership[] = [
  { slug: "lost-names-of-the-1910s", rank_in: 3, metric_label: "Last seen 1974" },
  { slug: "given-to-fewer-than-ten", rank_in: 40, metric_label: "6 births in 1974" },
];

function render(opts: {
  facts?: NameFacts | null;
  variants?: VariantSibling[];
  collections?: CollectionMembership[];
  rec?: NameRecord;
} = {}): string {
  const rec = opts.rec ?? record();
  const cls = classify({ series: rec.series, yM: rec.yM })!;
  return renderFullPage(rec, cls, {
    canonical: `https://nobodynamed.com/name/${rec.name}/`,
    facts: opts.facts === undefined ? facts() : opts.facts,
    variants: opts.variants ?? VARIANTS,
    collections: opts.collections ?? MEMBERSHIPS,
  });
}

/** The story strip only, so assertions cannot accidentally pass on copy from
 *  elsewhere in the page. */
function strip(html: string): string {
  const m = /<section class="story-strip"[\s\S]*?<\/section>/.exec(html);
  return m ? m[0] : "";
}

test("the strip surfaces the facts that make the page distinctive", () => {
  const s = strip(render());
  assert.ok(s, "no story strip rendered");
  for (const label of [
    "Rarity",
    "Peak year",
    "First recorded",
    "Last recorded",
    "Strongest state",
    "Trajectory",
  ]) {
    assert.ok(s.includes(`<dt>${label}</dt>`), `missing ${label} cell`);
  }
  assert.match(s, /Rarer than 95\.5% of girls' names/);
  assert.match(s, /West Virginia/);
  assert.match(s, /34% of births since state records began/);
});

test("common names never claim to be more common than 100% of names", () => {
  // rarity_pct_sex is the share strictly MORE common, so 100 - pct silently
  // includes this name and its ties. At rank 1 that produced the impossible
  // "More common than 100.0%".
  const top = strip(render({ facts: facts({ rarity_rank_sex: 1, rarity_pct_sex: 0, rarity_band: "ubiquitous" }) }));
  assert.ok(!/More common than 100/.test(top), top);
  assert.match(top, /The most common girls' name on record/);

  // Any common name states its exact rank rather than a derived complement.
  const common = strip(render({ facts: facts({ rarity_rank_sex: 12, rarity_pct_sex: 0.02, rarity_band: "common" }) }));
  assert.match(common, /#12 most common of 22,000 girls' names/);
  assert.ok(!/More common than/.test(common));

  // A rare name still reports the percentile that is actually stored.
  assert.match(strip(render()), /Rarer than 95\.5% of girls' names/);
});

test("the strip is omitted entirely when facts are unavailable", () => {
  const html = render({ facts: null });
  assert.equal(strip(html), "", "strip should not render without facts");
  // …and the page still renders, falling back to the four-cell dossier grid.
  assert.match(html, /<h1>Marvel<\/h1>/);
  assert.match(html, /Current vitality/);
  assert.match(html, /Peak generation/);
});

test("cells with no data are dropped, never rendered as placeholders", () => {
  const s = strip(
    render({
      facts: facts({
        top_state: null,
        top_state_share: null,
        states_seen: null,
        spike_year: null,
        catalyst_year: null,
        catalyst_title: null,
        gap_years_max: 0,
      }),
    }),
  );
  assert.ok(!s.includes("Strongest state"));
  assert.ok(!s.includes("Inflection"));
  assert.ok(!s.includes("Catalyst"));
  assert.ok(!s.includes("Dormancy"));
  assert.ok(!s.includes("—"), "the strip must not contain em-dash placeholders");
});

test("dormancy, inflection and catalyst appear when the data supports them", () => {
  const s = strip(
    render({
      facts: facts({
        gap_years_max: 55,
        gap_start_year: 1948,
        gap_end_year: 2002,
        spike_year: 1962,
        spike_ratio: 8.4,
        spike_baseline: 20,
        catalyst_year: 1978,
        catalyst_title: "Roots miniseries",
        catalyst_type: "tv",
      }),
    }),
  );
  assert.match(s, /<dt>Dormancy<\/dt>/);
  assert.match(s, /Absent 1948–2002/);
  assert.match(s, /<dt>Inflection<\/dt>/);
  assert.match(s, /8\.4× its own baseline/);
  assert.match(s, /<dt>Catalyst<\/dt>/);
  assert.match(s, /Roots miniseries/);
});

test("the summary sentence is built from numbers, and adapts to the name's shape", () => {
  assert.match(strip(render()), /Marvel has been recorded in 42 of the 146 years since 1880/);

  const once = strip(
    render({
      rec: record({ name: "Bethzy", series: series([[1998, 7]]) }),
      facts: facts({ name: "Bethzy", is_one_and_done: 1, first_year: 1998, last_year: 1998, max_annual: 7, years_recorded: 1 }),
    }),
  );
  assert.match(once, /appears in exactly one year of the American birth record: 1998/);
});

test("the story sentence reads as one sentence, not a chain of conjunctions", () => {
  // The three-clause form (record + last-seen + geography) once joined every
  // clause with ", and ", producing two "and"s in a single sentence. The unit
  // tests missed it because they only asserted on the leading clause.
  const line = /<p class="story-line">(.*?)<\/p>/.exec(strip(render()))?.[1] ?? "";
  assert.ok(line, "no story line rendered");
  assert.equal((line.match(/\band\b/g) ?? []).length, 1, `too many conjunctions: ${line}`);
  assert.match(line, /1974, and 34% of its births since state records began were in West Virginia\.$/);

  // Two clauses keep the plain "A, and B" form.
  const twoClause =
    /<p class="story-line">(.*?)<\/p>/.exec(
      strip(render({ facts: facts({ top_state: null, top_state_share: null }) })),
    )?.[1] ?? "";
  assert.equal((twoClause.match(/\band\b/g) ?? []).length, 1);
  assert.ok(twoClause.endsWith("."));
});

test("the strip never drifts into meaning-and-origin prose", () => {
  // The whole point of the page is the usage record. Etymology filler is what
  // every competing site already has, and it is what this guard prevents.
  const banned = /\b(means?|meaning|origin|derived from|Hebrew|Latin|Greek|biblical|signifies)\b/i;
  const variations = [
    render(),
    render({ facts: facts({ is_one_and_done: 1 }) }),
    render({ facts: facts({ comeback_gap: 55, comeback_year: 2003, gap_years_max: 55, gap_start_year: 1948, gap_end_year: 2002 }) }),
  ];
  for (const html of variations) {
    const s = strip(html);
    assert.ok(s, "expected a strip");
    assert.ok(!banned.test(s), `strip drifted into meaning/origin prose: ${banned.exec(s)?.[0]}`);
  }
});

test("spelling relatives link out, capped at five", () => {
  const many: VariantSibling[] = Array.from({ length: 9 }, (_, i) => ({
    name: `Marvel${i}`,
    sex: "F",
    total_count: 100 - i,
    status: "extinct",
    peak_year: 1920,
  }));
  const s = strip(render({ variants: many }));
  assert.match(s, /Spelling relatives/);
  assert.equal((s.match(/href="\/name\//g) ?? []).length, 5);

  assert.ok(!strip(render({ variants: [] })).includes("Spelling relatives"));
});

test("collection backlinks appear in the strip and in the explore rail", () => {
  const html = render();
  assert.match(strip(html), /href="\/collections\/lost-names-of-the-1910s\/"/);
  const rail = /<nav class="report-links"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
  assert.match(rail, /href="\/collections\/lost-names-of-the-1910s\/"/);
  assert.match(rail, /href="\/collections\/given-to-fewer-than-ten\/"/);
});

test("an unknown collection slug is dropped rather than linked", () => {
  const html = render({ collections: [{ slug: "retired-cluster", rank_in: 1, metric_label: null }] });
  assert.ok(!html.includes("/collections/retired-cluster/"));
});

test("FAQ structured data matches the visible headings byte for byte", () => {
  const html = render();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/gs)];
  const parsed = blocks.flatMap((b) => {
    const data = JSON.parse(b[1]!.replace(/\\u003c/g, "<"));
    return Array.isArray(data) ? data : [data];
  });
  const faq = parsed.find((d: { "@type"?: string }) => d["@type"] === "FAQPage");
  assert.ok(faq, "no FAQPage emitted");

  const questions: string[] = faq.mainEntity.map((q: { name: string }) => q.name);
  assert.ok(questions.includes("Which state uses Marvel the most?"));
  assert.ok(questions.includes("When was Marvel last recorded?"));
  for (const q of questions) {
    assert.ok(html.includes(`<h3>${q}</h3>`), `FAQ question not visible on the page: ${q}`);
  }
});

test("Dataset structured data gains the facts-derived measures", () => {
  const html = render();
  const parsed = [...html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/gs)].flatMap((b) => {
    const data = JSON.parse(b[1]!.replace(/\\u003c/g, "<"));
    return Array.isArray(data) ? data : [data];
  });
  const dataset = parsed.find((d: { mainEntity?: { "@type"?: string } }) => d.mainEntity?.["@type"] === "Dataset")
    ?.mainEntity;
  assert.ok(dataset, "no Dataset node");

  const names = dataset.variableMeasured.map((v: { name: string }) => v.name);
  assert.ok(names.includes("First recorded year"));
  assert.ok(names.includes("Rarity percentile within sex"));
  assert.ok(names.includes("Strongest state"));
  assert.equal(dataset.spatialCoverage.name, "West Virginia");
});

test("rare names lead their meta description with the rarity fact", () => {
  const oneOff = render({
    rec: record({ name: "Bethzy", series: series([[1998, 7]]) }),
    facts: facts({ name: "Bethzy", is_one_and_done: 1, first_year: 1998, last_year: 1998 }),
  });
  assert.match(oneOff, /<meta name="description" content="Bethzy appears in exactly one year/);

  const subTen = render({ facts: facts({ is_sub_ten: 1, max_annual: 8, years_recorded: 42 }) });
  assert.match(subTen, /never been given to as many as ten American babies/);

  // A common name keeps the generated narrative description.
  const common = render({ facts: facts({ rarity_pct_sex: 12, total_count: 900_000 }) });
  assert.ok(!/rarer than/i.test(/<meta name="description" content="([^"]*)"/.exec(common)?.[1] ?? ""));
});

test("a still-active name reports current volume rather than a last-seen year", () => {
  const live = record({ name: "Nova", series: series([[2000, 100], [2024, 4000], [YM, 4200]]) });
  const s = strip(
    render({ rec: live, facts: facts({ name: "Nova", latest_count: 4200, last_year: YM, status: "rising" }) }),
  );
  assert.match(s, /Still recorded/);
  assert.match(s, /4,200 in 2025/);
});

// The spelling-relatives rail links to a bare /name/<Name>/, which resolves to
// whichever sex is dominant for that name. A minority-sex row therefore
// describes a page the reader will never see: Daniel/M listed Danielle from
// Danielle/M's 1,895-birth row while the link opened Danielle/F's 371,803-birth
// history. The query has to do the filtering — the renderer has no way to tell
// which row it was handed.
test("spelling relatives are restricted to the rows their links resolve to", async () => {
  const { listSpellingVariants } = await import("../packages/shared/src/d1-queries");

  const ROWS = [
    { name: "Danielle", sex: "M", is_canonical_sex: 0, total_count: 1_895, status: "declining", peak_year: 1985 },
    { name: "Danial", sex: "M", is_canonical_sex: 1, total_count: 9_100, status: "stable", peak_year: 2007 },
  ];

  let seenSql = "";
  const db = {
    prepare(sql: string) {
      seenSql = sql;
      const stmt = {
        bind: () => stmt,
        async all() {
          // Stands in for D1 applying the WHERE clause: a row survives only if
          // the query actually asked for canonical-sex rows.
          const canonicalOnly = /is_canonical_sex\s*=\s*1/.test(sql);
          return { results: canonicalOnly ? ROWS.filter((r) => r.is_canonical_sex === 1) : ROWS };
        },
      };
      return stmt;
    },
  };

  const rows = await listSpellingVariants(db as never, "danial", "daniel", "M", 6);
  assert.ok(/is_canonical_sex\s*=\s*1/.test(seenSql), "query must filter to canonical-sex rows");
  assert.deepEqual(
    rows.map((r) => r.name),
    ["Danial"],
    "a minority-sex spelling must not be offered as a relative",
  );
});

// A name page is a page about one sex, so an unqualified "has not appeared in
// the Social Security data since" is a claim the page has no basis for. In the
// live corpus 232 spellings are dormant for one sex and active for the other —
// Edris/F last recorded in 1973, Edris/M with 25 births in 2025 — and the false
// sentence went out in the visible answer and the FAQ JSON-LD alike.
test("a dormant sex does not claim the whole name has vanished", () => {
  const dormant = series(Array.from({ length: 60 }, (_, i): [number, number] => [1913 + i, 40 - Math.floor(i / 2)]));
  const html = render({
    rec: record({
      name: "Edris",
      series: dormant,
      other: { sex: "M", series: series([[2024, 22], [YM, 25]]) },
    }),
    facts: facts({ name: "Edris", name_lower: "edris", last_year: 1973, latest_count: 0 }),
  });

  assert.ok(
    !/has not appeared in the Social Security data since/.test(html),
    "the page claimed the name vanished while the other sex is still recorded",
  );
  assert.match(html, /last recorded for girls in 1973/);
  assert.match(html, /remains in use for boys/);

  // With no other-sex activity the original, stronger sentence is still right.
  assert.match(render(), /has not appeared in the Social Security data since/);
});
