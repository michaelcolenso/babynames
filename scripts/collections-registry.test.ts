import assert from "node:assert/strict";
import test from "node:test";

import {
  allCollections,
  collectionsByGroup,
  expandCollections,
  getCollection,
  GROUP_ORDER,
} from "../packages/shared/src/collections";
import type { NameFacts } from "../packages/shared/src/schema";

function facts(overrides: Partial<NameFacts> = {}): NameFacts {
  return {
    name: "Marvel",
    name_lower: "marvel",
    sex: "F",
    total_count: 4_000,
    peak_year: 1931,
    peak_count: 412,
    latest_count: 0,
    status: "extinct",
    rarity_rank_sex: 21_000,
    rarity_total_sex: 22_000,
    rarity_pct_sex: 95.5,
    rarity_rank_all: 44_000,
    rarity_band: "rare",
    first_year: 1912,
    last_year: 1974,
    years_recorded: 41,
    span_years: 63,
    max_annual: 412,
    gap_years_max: 0,
    gap_start_year: null,
    gap_end_year: null,
    is_one_and_done: 0,
    is_sub_ten: 0,
    is_verge: 0,
    spike_year: null,
    spike_ratio: null,
    spike_baseline: null,
    spike_post_ratio: null,
    comeback_gap: null,
    comeback_year: null,
    comeback_strength: null,
    top_state: "WV",
    top_state_share: 0.34,
    exclusive_state: null,
    states_seen: 12,
    is_canonical_sex: 1,
    variant_key: "mrvl",
    variant_count: 1,
    variant_is_primary: 1,
    catalyst_year: null,
    catalyst_title: null,
    catalyst_type: null,
    source_data_version: "test",
    analysis_year: 2026,
    ...overrides,
  };
}

test("every slug is unique and URL-safe", () => {
  const slugs = allCollections().map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate slug in the registry");
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${slug} is not a clean slug`);
  }
});

test("expansion covers the base set, one page per decade, and one per state", () => {
  const defs = expandCollections({ minYear: 1880, maxYear: 2025 });
  const slugs = new Set(defs.map((d) => d.slug));
  for (const base of [
    "given-to-fewer-than-ten",
    "one-year-wonders",
    "unusual-spellings",
    "one-hit-spikes",
    "fifty-year-comebacks",
    "on-the-verge",
    "famous-name-effects",
  ]) {
    assert.ok(slugs.has(base), `missing base collection ${base}`);
  }
  assert.ok(slugs.has("lost-names-of-the-1880s"));
  assert.ok(slugs.has("lost-names-of-the-1920s"));
  // A name cannot be shown to have vanished when its peak decade just ended.
  assert.ok(!slugs.has("lost-names-of-the-2020s"));
  assert.ok(slugs.has("only-in-west-virginia"));
  assert.ok(slugs.has("only-in-district-of-columbia"));
  assert.equal(defs.filter((d) => d.slug.startsWith("only-in-")).length, 51);
});

test("unknown slugs resolve to undefined so routes can 404 without touching D1", () => {
  assert.equal(getCollection("no-such-collection"), undefined);
  assert.equal(getCollection(""), undefined);
  assert.ok(getCollection("one-year-wonders"));
});

test("related slugs all resolve", () => {
  for (const def of allCollections()) {
    for (const slug of def.related) {
      assert.ok(getCollection(slug), `${def.slug} points at unknown related slug ${slug}`);
      assert.notEqual(slug, def.slug, `${def.slug} lists itself as related`);
    }
  }
});

test("every collection carries the SEO and framing fields a page needs", () => {
  for (const def of allCollections()) {
    for (const field of ["title", "seoTitle", "seoDescription", "eyebrow", "lede", "body", "metricHeading"] as const) {
      assert.ok(def[field] && def[field].length > 0, `${def.slug} is missing ${field}`);
    }
    assert.ok(def.seoDescription.length <= 320, `${def.slug} meta description is too long`);
    assert.ok(def.columns.length > 0, `${def.slug} has no columns`);
    assert.ok(def.maxMembers > 0);
    assert.ok(GROUP_ORDER.includes(def.group));
  }
});

test("copy never drifts into meaning-and-origin filler", () => {
  const banned = /\b(means?|meaning|origin|derived from|Hebrew|Latin|Greek|biblical)\b/i;
  for (const def of allCollections()) {
    const copy = `${def.lede} ${def.body} ${def.seoDescription}`;
    assert.ok(!banned.test(copy), `${def.slug} copy drifted into meaning/origin prose`);
  }
});

test("sub-ten selection is about the best year, and needs a real record", () => {
  const def = getCollection("given-to-fewer-than-ten")!;
  const picked = def.select([
    facts({ name: "Steady", is_sub_ten: 1, years_recorded: 40, max_annual: 8, peak_year: 1930 }),
    facts({ name: "Blip", is_sub_ten: 1, years_recorded: 2, max_annual: 6 }),
    facts({ name: "Big", is_sub_ten: 0, years_recorded: 40, max_annual: 900 }),
  ]);
  assert.deepEqual(picked.map((p) => p.row.name), ["Steady"]);
  assert.equal(picked[0]!.metricLabel, "8 births in 1930");
  assert.equal(picked[0]!.metricValue, 8);
});

test("one-year-wonders takes only single-year names, biggest year first", () => {
  const def = getCollection("one-year-wonders")!;
  const picked = def.select([
    facts({ name: "Small", is_one_and_done: 1, max_annual: 6, first_year: 1931 }),
    facts({ name: "Large", is_one_and_done: 1, max_annual: 40, first_year: 1948 }),
    facts({ name: "Persistent", is_one_and_done: 0, max_annual: 40 }),
  ]);
  assert.deepEqual(picked.map((p) => p.row.name), ["Large", "Small"]);
  assert.equal(picked[0]!.metricLabel, "40 births, 1948");
});

test("state collections only take names whose exclusivity cleared the floor", () => {
  const def = getCollection("only-in-texas")!;
  const picked = def.select([
    facts({ name: "Tejano", exclusive_state: "TX", top_state_share: 0.94 }),
    facts({ name: "Spread", exclusive_state: null, top_state: "TX", top_state_share: 0.55 }),
    facts({ name: "Vermonter", exclusive_state: "VT", top_state_share: 0.97 }),
  ]);
  assert.deepEqual(picked.map((p) => p.row.name), ["Tejano"]);
  assert.equal(picked[0]!.metricLabel, "94% of births since 1910");
});

test("one-hit-spikes requires the spike to have fallen back", () => {
  const def = getCollection("one-hit-spikes")!;
  const picked = def.select([
    facts({ name: "OneHit", spike_year: 1962, spike_ratio: 8, spike_post_ratio: 0.2 }),
    // A sustained step up: the jump is real, the fall never happened.
    facts({ name: "SteppedUp", spike_year: 1960, spike_ratio: 5, spike_post_ratio: 0.98 }),
    // Too recent to judge; the collection must not claim it fell back.
    facts({ name: "TooRecent", spike_year: 2024, spike_ratio: 9, spike_post_ratio: null }),
  ]);
  assert.deepEqual(picked.map((p) => p.row.name), ["OneHit"]);
});

test("lost-names is scoped to its own decade and to names actually gone", () => {
  const def = getCollection("lost-names-of-the-1920s")!;
  const picked = def.select([
    facts({ name: "Gone", peak_year: 1924, status: "extinct", latest_count: 0, peak_count: 300, last_year: 1961 }),
    facts({ name: "Alive", peak_year: 1924, status: "declining", latest_count: 40, peak_count: 300 }),
    facts({ name: "Later", peak_year: 1955, status: "extinct", latest_count: 0, peak_count: 300 }),
    facts({ name: "Tiny", peak_year: 1924, status: "extinct", latest_count: 0, peak_count: 6 }),
    // Below the reporting floor in the latest year, but recorded last year —
    // classify() calls this declining, not extinct, and so must the collection.
    facts({ name: "Vicki", peak_year: 1924, status: "declining", latest_count: 0, peak_count: 300, last_year: 2024 }),
  ]);
  assert.deepEqual(picked.map((p) => p.row.name), ["Gone"]);
  assert.equal(picked[0]!.metricLabel, "Last seen 1961");
});

test("the comeback label describes the gap that actually produced the revival", () => {
  const def = getCollection("fifty-year-comebacks")!;
  // Longest gap is 1881-1940; the revival came out of the LATER 1942-1991 gap.
  // Reading the window off gap_start_year/gap_end_year would print
  // "Absent 1881-1940 (50 years)" — a window and a duration that disagree.
  const picked = def.select([
    facts({
      name: "Returned",
      gap_years_max: 60,
      gap_start_year: 1881,
      gap_end_year: 1940,
      comeback_gap: 50,
      comeback_year: 1992,
    }),
  ]);
  assert.equal(picked[0]!.metricLabel, "Absent 1942–1991 (50 years)");
});

test("unusual-spellings excludes the dominant spelling of its own family", () => {
  const def = getCollection("unusual-spellings")!;
  const picked = def.select([
    facts({ name: "Katelyn", variant_count: 5, variant_is_primary: 0, total_count: 5_000 }),
    facts({ name: "Caitlin", variant_count: 5, variant_is_primary: 1, total_count: 90_000 }),
    facts({ name: "Solo", variant_count: 1, variant_is_primary: 1, total_count: 5_000 }),
  ]);
  assert.deepEqual(picked.map((p) => p.row.name), ["Katelyn"]);
  assert.equal(picked[0]!.metricLabel, "1 of 5 spellings");
});

test("a minority-sex row never carries a claim about the page it links to", () => {
  const def = getCollection("one-year-wonders")!;
  const picked = def.select([
    facts({ name: "Ailany", sex: "M", is_one_and_done: 1, is_canonical_sex: 0, max_annual: 18 }),
    facts({ name: "Bethzy", sex: "F", is_one_and_done: 1, is_canonical_sex: 1, max_annual: 7 }),
  ]);
  assert.deepEqual(picked.map((p) => p.row.name), ["Bethzy"]);
});

test("selection respects each collection's member cap", () => {
  const def = getCollection("one-year-wonders")!;
  const many = Array.from({ length: 500 }, (_, i) =>
    facts({ name: `N${i}`, name_lower: `n${i}`, is_one_and_done: 1, max_annual: i + 5 }),
  );
  assert.equal(def.select(many).length, def.maxMembers);
});

test("grouping returns every group key, even when empty", () => {
  const groups = collectionsByGroup();
  for (const g of GROUP_ORDER) assert.ok(Array.isArray(groups[g]), `missing group ${g}`);
  assert.equal(
    Object.values(groups).reduce((n, list) => n + list.length, 0),
    allCollections().length,
  );
});
