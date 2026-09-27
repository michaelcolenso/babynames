// Regression tests for fixes from docs/site-audit-2026-09-24.md.

import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as stateRoute } from "../apps/web/functions/state/[state]/index";
import { renderYearPage, type YearNameRow } from "../packages/shared/src/render-year";

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
