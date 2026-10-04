import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classify } from "../packages/shared/src/classify";
import { getNameEnrichmentBundle } from "../packages/shared/src/d1-queries";
import { renderFullPage } from "../packages/shared/src/render-name";
import { buildSparkline } from "../packages/shared/src/sparkline";
import type {
  NameEnrichmentBundle,
  NameRecord,
  NameRegionalAnomaly,
  Sex,
} from "../packages/shared/src/schema";
import {
  assertLifeTableComplete,
  buildEnrichmentSql,
  buildSurvivalTable,
  computeEnrichmentRows,
  parseLifeTableCsv,
  survivalAt,
  type EnrichmentSourceData,
} from "./build-enrichment";

// Just the part of D1Result these fixtures provide.
type D1ResultSet<T> = { results: T[] };

function fakeD1(fixtures: Record<string, unknown>): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first<T>() {
              return fixtures[sqlKey(sql)] as T | null;
            },
            async all<T>() {
              return { results: fixtures[sqlKey(sql)] ?? [] } as D1ResultSet<T>;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function sqlKey(sql: string): string {
  if (sql.includes("name_enrichment_profiles")) return "profile";
  if (sql.includes("name_catalysts")) return "catalysts";
  if (sql.includes("name_historical_profiles")) return "historical";
  if (sql.includes("name_regional_anomalies")) return "regional";
  throw new Error(`unmatched SQL fixture: ${sql}`);
}

test("getNameEnrichmentBundle returns typed profile, catalysts, historical rows, and regional anomalies independently", async () => {
  const bundle = await getNameEnrichmentBundle(fakeD1({
    profile: {
      name_lower: "mildred",
      sex: "F",
      total_living_est: 52000,
      median_age: 84,
      age_range_low: 76,
      age_range_high: 93,
      wave_topology: "Glacier",
      latest_pct: 0.000001,
      analysis_year: 2026,
      source_version: "test",
    },
    catalysts: [
      {
        trigger_year: 1920,
        catalyst_title: "Silent film prominence",
        catalyst_type: "movie",
        impact_score: "medium",
        description: "A curated marker.",
        source_url: null,
      },
    ],
    historical: [
      {
        era_year: 1900,
        top_occupations: "[\"Homemaker\",\"Teacher\"]",
        primary_region: "Midwest",
        urban_vs_rural: "Mostly rural",
      },
    ],
    regional: [
      {
        state: "UT",
        era_start_year: 1900,
        location_quotient: 3.4,
        name_births: 88,
        historical_peak_year: 1903,
        anomaly_type: "state-era",
      },
    ],
  }), "mildred", "F");

  assert.equal(bundle.profile?.median_age, 84);
  assert.equal(bundle.catalysts.length, 1);
  assert.deepEqual(bundle.historicalProfiles[0]?.top_occupations, ["Homemaker", "Teacher"]);
  assert.equal(bundle.regionalAnomalies[0]?.state, "UT");
});

test("renderFullPage renders dossier enrichment modules without requiring catalysts for regional anomalies", () => {
  const record: NameRecord = {
    name: "Mildred",
    sex: "F",
    ym: 1900,
    yM: 2024,
    series: {
      1900: 1200,
      1901: 1300,
      1902: 1400,
      1903: 1500,
      1904: 1300,
      2024: 5,
    },
  };
  const classification = classify({ series: record.series, yM: record.yM });
  assert.ok(classification);

  const enrichment: NameEnrichmentBundle = {
    profile: {
      name_lower: "mildred",
      sex: "F",
      total_living_est: 52000,
      median_age: 84,
      age_range_low: 76,
      age_range_high: 93,
      wave_topology: "Glacier",
      latest_pct: 0.000001,
      analysis_year: 2026,
      source_version: "test",
    },
    catalysts: [],
    historicalProfiles: [
      {
        era_year: 1900,
        top_occupations: ["Homemaker", "Teacher"],
        primary_region: "Midwest",
        urban_vs_rural: "Mostly rural",
      },
    ],
    regionalAnomalies: [
      {
        state: "UT",
        era_start_year: 1900,
        location_quotient: 3.4,
        name_births: 88,
        historical_peak_year: 1903,
        anomaly_type: "state-era",
      },
    ],
  };

  // The heartland card reads latest-era strongholds (getNameStrongholds), not
  // the historical rows in the enrichment bundle, so a name's present-day
  // concentration can't be hidden behind a decades-old peak.
  const strongholds: NameRegionalAnomaly[] = [
    {
      state: "UT",
      era_start_year: 2020,
      location_quotient: 3.4,
      name_births: 88,
      historical_peak_year: 2023,
      anomaly_type: "regional skew",
    },
  ];

  const html = renderFullPage(record, classification, {
    canonical: "https://nobodynamed.com/name/Mildred/",
    enrichment,
    strongholds,
  });

  assert.match(html, /Living profile/);
  assert.match(html, /Playground Density Index/);
  assert.match(html, /Wave type/);
  assert.match(html, /Geographic heartland/);
  assert.match(html, /Historical legacy/);
  assert.doesNotMatch(html, /Cultural triggers/);
});

test("buildSparkline renders catalyst markers with title text", () => {
  const svg = buildSparkline(
    { 1983: 10, 1984: 200, 1985: 80 },
    1983,
    1985,
    {
      status: "rising",
      markers: [{ year: 1984, label: "Movie catalyst", kind: "movie" }],
    },
  );

  assert.match(svg, /class="spark-marker/);
  assert.match(svg, /1984: Movie catalyst/);
});

test("computeEnrichmentRows and buildEnrichmentSql produce deterministic offline seed data", () => {
  const source: EnrichmentSourceData = {
    analysisYear: 2026,
    sourceVersion: "test",
    lifeTable: [
      { sex: "F", age: 1, survival_probability: 0.99 },
      { sex: "F", age: 2, survival_probability: 0.98 },
      { sex: "F", age: 11, survival_probability: 0.96 },
      { sex: "F", age: 26, survival_probability: 0.94 },
      { sex: "F", age: 31, survival_probability: 0.93 },
    ],
    nationalNames: [
      {
        name: "Ava",
        name_lower: "ava",
        sex: "F",
        total_count: 610,
        latest_count: 220,
        series: {
          1995: 100,
          2000: 90,
          2015: 200,
          2024: 220,
          2025: 240,
        },
      },
    ],
    yearTotals: [
      { year: 2025, sex: "F", total: 100000 },
    ],
    catalysts: [],
    historicalProfiles: [],
    stateSeries: [],
  };

  const rows = computeEnrichmentRows(source);
  assert.equal(rows.profiles[0]?.wave_topology, "Steady Wave");
  assert.equal(rows.profiles[0]?.latest_pct, 0.0024);

  const sqlA = buildEnrichmentSql(rows);
  const sqlB = buildEnrichmentSql(rows);
  assert.equal(sqlA, sqlB);
  assert.match(sqlA, /DELETE FROM name_enrichment_profiles;/);
  assert.match(sqlA, /INSERT INTO name_enrichment_profiles/);
});

// ---------------------------------------------------------------------------
// Builder: life table, profile math, regional anomalies, SQL emission.
// ---------------------------------------------------------------------------

const lifeTableCsv = readFileSync(new URL("../data/manual/life-table.csv", import.meta.url), "utf8");

test("life-table.csv is a well-formed cumulative survival table for both sexes", () => {
  const rows = parseLifeTableCsv(lifeTableCsv);
  const ageSets: Record<string, number[]> = {};
  for (const sex of ["M", "F"] as const) {
    const pts = rows.filter((r) => r.sex === sex).sort((a, b) => a.age - b.age);
    assert.ok(pts.length >= 10, `${sex}: expected a table of checkpoints`);
    assert.equal(pts[0]!.age, 0);
    assert.equal(pts[0]!.survival_probability, 1, `${sex}: survival at birth must be 1`);
    assert.equal(pts[pts.length - 1]!.survival_probability, 0, `${sex}: the table must end at 0`);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!;
      const cur = pts[i]!;
      assert.ok(cur.age > prev.age, `${sex}: ages must be strictly increasing at ${cur.age}`);
      assert.ok(
        cur.survival_probability <= prev.survival_probability,
        `${sex}: survival rises between age ${prev.age} and ${cur.age}`,
      );
      assert.ok(cur.survival_probability >= 0 && cur.survival_probability <= 1);
    }
    ageSets[sex] = pts.map((p) => p.age);
  }
  assert.deepEqual(ageSets.M, ageSets.F, "both sexes should use the same checkpoint ages");
});

test("survivalAt interpolates linearly between checkpoints and clamps outside them", () => {
  const table = buildSurvivalTable([
    { sex: "F", age: 0, survival_probability: 1 },
    { sex: "F", age: 10, survival_probability: 0.9 },
    { sex: "F", age: 20, survival_probability: 0.5 },
    { sex: "M", age: 0, survival_probability: 1 },
    { sex: "M", age: 10, survival_probability: 0.8 },
  ]);
  assert.equal(survivalAt(table, "F", 0), 1);
  assert.ok(Math.abs(survivalAt(table, "F", 5) - 0.95) < 1e-12);
  assert.ok(Math.abs(survivalAt(table, "F", 15) - 0.7) < 1e-12);
  assert.equal(survivalAt(table, "F", 99), 0.5);
  assert.equal(survivalAt(table, "M", 99), 0.8);

  // A one-sex table is usable for that sex only; the CLI rejects it up front.
  const femaleOnly = buildSurvivalTable([{ sex: "F", age: 0, survival_probability: 1 }]);
  assert.equal(survivalAt(femaleOnly, "F", 40), 1);
  assert.throws(() => survivalAt(femaleOnly, "M", 40), /no rows for sex M/);
  assert.throws(() => assertLifeTableComplete(femaleOnly), /missing M or F rows/);
});

test("computeEnrichmentRows ages birth cohorts by the survival table (hand-checkable case)", () => {
  // 100 girls born in 2016 (age 10 in 2026) and 100 in 2006 (age 20).
  // Table: S(10)=0.9, S(20)=0.5  =>  living = 90 + 50 = 140; the age-10 cohort
  // alone already holds 64% of survivors, so median and 25th percentile are 10
  // and the 75th percentile is 20.
  const rows = computeEnrichmentRows({
    analysisYear: 2026,
    sourceVersion: "test",
    lifeTable: [
      { sex: "F", age: 0, survival_probability: 1 },
      { sex: "F", age: 10, survival_probability: 0.9 },
      { sex: "F", age: 20, survival_probability: 0.5 },
      { sex: "M", age: 0, survival_probability: 1 },
      { sex: "M", age: 20, survival_probability: 0.5 },
    ],
    nationalNames: [
      { name: "Test", name_lower: "test", sex: "F", total_count: 200, latest_count: 100, series: { 2006: 100, 2016: 100 } },
      { name: "Few", name_lower: "few", sex: "F", total_count: 99, latest_count: 99, series: { 2016: 99 } },
    ],
    yearTotals: [{ year: 2016, sex: "F", total: 1000 }],
    catalysts: [],
    historicalProfiles: [],
    stateSeries: [],
  });
  assert.equal(rows.profiles.length, 1, "names under 100 recorded births get no profile");
  const p = rows.profiles[0]!;
  assert.equal(p.name_lower, "test");
  assert.equal(p.total_living_est, 140);
  assert.equal(p.median_age, 10);
  assert.equal(p.age_range_low, 10);
  assert.equal(p.age_range_high, 20);
  assert.equal(p.latest_pct, 0.1);
  assert.equal(p.analysis_year, 2026);
  assert.equal(p.source_version, "test");
});

test("computeEnrichmentRows keeps regional anomalies only for profiled names", () => {
  const row = (name_lower: string, sex: Sex, year: number, count: number) => ({ name_lower, sex, year, count });
  const rows = computeEnrichmentRows({
    analysisYear: 2026,
    sourceVersion: "test",
    lifeTable: [
      { sex: "F", age: 0, survival_probability: 1 },
      { sex: "F", age: 100, survival_probability: 0 },
      { sex: "M", age: 0, survival_probability: 1 },
      { sex: "M", age: 100, survival_probability: 0 },
    ],
    nationalNames: [
      { name: "Bertha", name_lower: "bertha", sex: "F", total_count: 800, latest_count: 0, series: { 1950: 400, 1951: 400 } },
    ],
    yearTotals: [],
    catalysts: [],
    historicalProfiles: [],
    stateSeries: [
      // MS: Bertha is 200 of 1,000 girls in the 1950s; TX: 100 of 10,000.
      { state: "MS", rows: [row("bertha", "F", 1950, 100), row("bertha", "F", 1951, 100), row("other", "F", 1950, 800)] },
      { state: "TX", rows: [row("bertha", "F", 1950, 100), row("other", "F", 1950, 9900)] },
    ],
  });
  // LQ(MS) = (200/1000) / (300/11000) = 7.33; LQ(TX) = (100/10000) / (300/11000) = 0.37.
  assert.equal(rows.anomalies.length, 1);
  const a = rows.anomalies[0]!;
  assert.equal(a.name_lower, "bertha");
  assert.equal(a.state, "MS");
  assert.equal(a.era_start_year, 1950);
  assert.equal(a.name_births, 200);
  assert.ok(Math.abs(a.location_quotient - 7.3333) < 1e-3);
  assert.equal(a.anomaly_type, "regional stronghold");
  assert.equal(a.historical_peak_year, 1950);
});

test("buildEnrichmentSql escapes quotes, writes NULL for blanks and stores occupations as JSON", () => {
  const sql = buildEnrichmentSql({
    analysisYear: 2026,
    sourceVersion: "test",
    profiles: [],
    anomalies: [],
    catalysts: [
      {
        name_lower: "karen",
        sex: "F",
        trigger_year: 2020,
        catalyst_title: `The "Karen" meme, o'clock`,
        catalyst_type: "meme",
        impact_score: null,
        description: "",
        source_url: null,
      },
    ],
    historicalProfiles: [
      {
        name_lower: "mildred",
        sex: "F",
        era_year: 1900,
        top_occupations: ["Homemaker", "Teacher"],
        primary_region: "Midwest",
        urban_vs_rural: "Mostly rural",
      },
    ],
  });
  assert.match(sql, /'The "Karen" meme, o''clock'/);
  assert.match(sql, /'meme',NULL,NULL,NULL\);/);
  assert.match(sql, /'\["Homemaker","Teacher"\]'/);
});

// Real data: SSA counts as mirrored in production D1 (name_years) for 14 names,
// next to the values production stored for them in name_enrichment_profiles
// (read 2026-10-03; source_version ssa-2025, analysis_year 2026).
interface D1Fixture {
  analysis_year: number;
  names: {
    name_lower: string;
    sex: Sex;
    series: Record<string, number>;
    expected: { total_living_est: number; median_age: number; age_range_low: number; age_range_high: number };
  }[];
}
const d1Fixture = JSON.parse(
  readFileSync(new URL("./fixtures/enrichment-d1.real.fixture.json", import.meta.url), "utf8"),
) as D1Fixture;

// data/manual/life-table.csv is the table production's rows imply (see
// data/manual/README.md), so a reseed from this repo leaves the numbers visitors
// see unchanged. Median age and both quartiles must match exactly; living totals
// are allowed a few people of slack because the table was fitted to stored
// totals rather than copied from a source file. If this fails after someone
// edits the CSV, the site's figures will change on the next seed (for Karen:
// stored 774,778 living / median 65; the pre-fit CSV gave 845,523 / 66).
test(
  "builder reproduces production's stored enrichment profiles for pinned names",
  () => {
    const rows = computeEnrichmentRows({
      analysisYear: d1Fixture.analysis_year,
      sourceVersion: "ssa-2025",
      lifeTable: parseLifeTableCsv(lifeTableCsv),
      nationalNames: d1Fixture.names.map((n) => ({
        name: n.name_lower,
        name_lower: n.name_lower,
        sex: n.sex,
        total_count: 0,
        latest_count: 0,
        series: Object.fromEntries(Object.entries(n.series).map(([y, c]) => [Number(y), c])),
      })),
      yearTotals: [],
      catalysts: [],
      historicalProfiles: [],
      stateSeries: [],
    });
    for (const n of d1Fixture.names) {
      const label = `${n.name_lower}/${n.sex}`;
      const got = rows.profiles.find((p) => p.name_lower === n.name_lower && p.sex === n.sex);
      assert.ok(got, `${label}: no profile built`);
      assert.equal(got.median_age, n.expected.median_age, `${label}: median age`);
      assert.equal(got.age_range_low, n.expected.age_range_low, `${label}: 25th percentile`);
      assert.equal(got.age_range_high, n.expected.age_range_high, `${label}: 75th percentile`);
      const tolerance = Math.max(10, n.expected.total_living_est * 1e-5);
      assert.ok(
        Math.abs(got.total_living_est - n.expected.total_living_est) <= tolerance,
        `${label}: living ${got.total_living_est} vs stored ${n.expected.total_living_est}`,
      );
    }
  },
);
