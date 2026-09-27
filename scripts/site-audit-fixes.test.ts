// Regression tests for fixes from docs/site-audit-2026-09-24.md.

import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as stateRoute } from "../apps/web/functions/state/[state]/index";
import { renderYearPage, type YearNameRow } from "../packages/shared/src/render-year";
import { classify } from "../packages/shared/src/classify";
import { renderFullPage } from "../packages/shared/src/render-name";
import type { NameRegionalAnomaly } from "../packages/shared/src/schema";

function stateRequest(path: string, db: unknown = {}) {
  const url = new URL(`https://example.com${path}`);
  const param = url.pathname.split("/")[2] ?? "";
  return stateRoute({
    params: { state: param },
    request: new Request(url),
    env: { DB: db },
  } as never);
}

test("postal abbreviations 301 to the state slug in one hop", async () => {
  for (const path of ["/state/CA/", "/state/ca/", "/state/Ca"]) {
    const res = await stateRequest(path);
    assert.equal(res.status, 301, path);
    assert.equal(res.headers.get("Location"), "https://example.com/state/california/", path);
  }
});

test("wrong-case slugs redirect, keeping ?year=", async () => {
  const res = await stateRequest("/state/New-York/?year=1990");
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("Location"), "https://example.com/state/new-york/?year=1990");
});

test("unknown uppercase slugs 404 instead of redirecting to themselves", async () => {
  for (const path of ["/state/XX/", "/state/NOTASTATE/", "/state/nowhere/"]) {
    const res = await stateRequest(path);
    assert.equal(res.status, 404, path);
    assert.equal(res.headers.get("Location"), null, path);
    const html = await res.text();
    assert.match(html, /<header class="site">/, "404 should carry site chrome");
    assert.match(html, /<meta name="robots" content="noindex">/);
  }
});

function rows(perSex: number): YearNameRow[] {
  const out: YearNameRow[] = [];
  for (const sex of ["F", "M"]) {
    for (let rank = 1; rank <= perSex; rank++) {
      out.push({ name: `${sex}name${rank}`, sex, count: 10_000 - rank, rank });
    }
  }
  out[0]!.name = "Jessica";
  out[perSex]!.name = "Michael";
  return out;
}

test("year page lists 100 per sex without the templated mid-century line", () => {
  const html = renderYearPage(1985, rows(100), { canonical: "https://example.com/year/1985/" });
  assert.equal((html.match(/<li><span class="rank">/g) ?? []).length, 200);
  assert.doesNotMatch(html, /mid-century|perennial powerhouse/);
  assert.match(html, /millennial births/);
  assert.match(html, /<title>Top 100 Baby Names of 1985: Jessica &amp; Michael<\/title>/);
  assert.match(html, /<h2>Girls<\/h2>/, "list headings follow the h1 without skipping a level");
});

test("year page era label follows the year", () => {
  const html1880 = renderYearPage(1880, rows(3), { canonical: "https://example.com/year/1880/" });
  assert.match(html1880, /late-19th-century births/);
  const html2025 = renderYearPage(2025, rows(3), { canonical: "https://example.com/year/2025/" });
  assert.match(html2025, /Gen Alpha births/);
});

test("years-at-#1 clause comes from the rankings data", () => {
  const numberOnes = [
    ...[1985, 1986, 1987].map((year) => ({ year, sex: "F", name: "Jessica" })),
    ...[1954, 1955, 1985].map((year) => ({ year, sex: "M", name: "Michael" })),
  ];
  const html = renderYearPage(1985, rows(3), { canonical: "https://example.com/year/1985/", numberOnes });
  assert.match(html, /Jessica was the #1 girls’ name for 3 years in all \(1985–1987\)/);
  assert.match(html, /Michael was the #1 boys’ name for 3 years in all \(between 1954 and 1985\)/);
});

test("status chips render and count faded names", () => {
  const statuses = new Map([
    ["Jessica|F", { status: "endangered", latest_count: 424 }],
    ["Michael|M", { status: "endangered", latest_count: 8094 }],
    ["Fname2|F", { status: "extinct", latest_count: 0 }],
  ]);
  const html = renderYearPage(1985, rows(3), { canonical: "https://example.com/year/1985/", statuses });
  assert.match(html, /Jessica<\/a> <span class="year-status year-status-endangered">Endangered<\/span>/);
  assert.match(html, /Michael<\/a> <span class="year-status year-status-endangered">Past peak<\/span>/);
  assert.match(html, /Of the 3 names below, 2 are now endangered or extinct/);
});

// ── Name page (#2, #4, rank line, copy nits) ────────────────────────────────


function nameRecord(peakLast: boolean) {
  const series: Record<number, number> = {};
  for (let y = 1980; y <= 2025; y++) series[y] = peakLast ? 100 + (y - 1980) * 10 : 20_000 - (y - 1980) * 150;
  return { name: "Testa", sex: "F" as const, ym: 1880, yM: 2025, series };
}

const PROFILE = {
  name_lower: "testa",
  sex: "F" as const,
  total_living_est: 541_507,
  median_age: 16,
  age_range_low: 9,
  age_range_high: 24,
  wave_topology: "Plateau" as const,
  latest_pct: 0.008,
  analysis_year: 2026,
  source_version: "ssa-2025",
};

function anomaly(state: string, era: number, lq: number, births: number): NameRegionalAnomaly {
  return { state, era_start_year: era, location_quotient: lq, name_births: births, historical_peak_year: null, anomaly_type: "state-era" };
}

function renderName(opts: { peakLast?: boolean; strongholds?: NameRegionalAnomaly[]; latestRank?: number | null } = {}) {
  const record = nameRecord(opts.peakLast ?? false);
  const cls = classify({ series: record.series, yM: record.yM })!;
  return renderFullPage(record, cls, {
    canonical: "https://example.com/name/Testa/",
    enrichment: {
      profile: PROFILE as never,
      catalysts: [],
      historicalProfiles: [],
      // An old, small-numbers era signal — must never headline.
      regionalAnomalies: [anomaly("AZ", 1940, 7.2, 245)],
    },
    strongholds: opts.strongholds ?? [],
    latestRank: opts.latestRank,
  });
}

test("the FAQ living-population answer matches the Living profile card", () => {
  const html = renderName();
  assert.match(html, /An estimated 541,507 living Americans are named Testa\./);
  assert.match(html, /<div class="value">541,507<\/div>/);
  assert.match(html, /approximately 16 years, with most bearers falling between 9 and 24/);
});

test("geography claims come from the latest era only, with a births floor", () => {
  const none = renderName();
  assert.doesNotMatch(none, /Arizona/, "a 1940s anomaly must not headline");
  assert.doesNotMatch(none, /Where is Testa most common\?/);

  const thin = renderName({ strongholds: [anomaly("VT", 2020, 4.0, 12)] });
  assert.doesNotMatch(thin, /Strongest in Vermont|strongest geographic signal in Vermont/);

  const solid = renderName({ strongholds: [anomaly("VT", 2020, 4.0, 12), anomaly("UT", 2020, 1.6, 1400)] });
  assert.match(solid, /strongest geographic signal in Utah, where it appeared 1\.6× more often than the national baseline in the 2020s/);
  assert.match(solid, /Strongest in Utah\./);
  assert.match(solid, /<div class="value">Utah<\/div>/, "heartland card agrees with the FAQ");
});

test("rank shows when known, and the #1 name is not called 'only'", () => {
  const html = renderName({ latestRank: 1 });
  assert.match(html, /<span class="rank-label">#1 girls’ name in 2025<\/span>/);
  assert.match(html, /Testa was the #1 girls’ name in 2025/);
  assert.doesNotMatch(html, /In 2025, only /);
});

test("a name peaking in the latest year says so once", () => {
  const html = renderName({ peakLast: true });
  assert.match(html, /Testa hit a new high in 2025 \(550 births\)\./);
  assert.doesNotMatch(html, /peaked in 2025 with 550 births; 550 in 2025/);
});
