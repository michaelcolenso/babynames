import assert from "node:assert/strict";
import test from "node:test";

import { classify } from "../packages/shared/src/classify";
import {
  getNameEnrichmentBundle,
  type D1ResultSet,
} from "../packages/shared/src/d1-queries";
import { renderFullPage } from "../packages/shared/src/render-name";
import { buildSparkline } from "../packages/shared/src/sparkline";
import type {
  NameEnrichmentBundle,
  NameRecord,
} from "../packages/shared/src/schema";
import {
  buildEnrichmentSql,
  computeEnrichmentRows,
  type EnrichmentSourceData,
} from "./build-enrichment";

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

  const html = renderFullPage(record, classification, {
    canonical: "https://nobodynamed.com/name/Mildred/",
    enrichment,
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
