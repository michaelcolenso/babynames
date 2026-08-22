import assert from "node:assert/strict";
import test from "node:test";

import {
  computeFlashFloods,
  csvToNameYearRows,
  evaluateClaims,
  groupSeries,
  interpolateBody,
  parseSsaCsv,
  parseTotalsCsv,
  verifyAsserts,
  chartPanelHtml,
  type FlashFloodOptions,
  type NameYearRow,
} from "./factory-compute";
import type { ContentDefinition, FlashFloodMember } from "./factory-types";

const OPTS: Partial<FlashFloodOptions> = { dataMaxYear: 2010 };

function seriesFrom(entries: Array<[string, string, Record<number, number>]>): {
  series: Map<string, Record<number, number>>;
  display: Map<string, string>;
} {
  const series = new Map<string, Record<number, number>>();
  const display = new Map<string, string>();
  for (const [name, sex, s] of entries) {
    series.set(`${name.toLowerCase()}|${sex}`, s);
    display.set(`${name.toLowerCase()}|${sex}`, name);
  }
  return { series, display };
}

test("groupSeries groups by lowercase name+sex", () => {
  const rows: NameYearRow[] = [
    { year: 1995, name: "KUNTA", sex: "M", count: 500 },
    { year: 1995, name: "Kunta", sex: "M", count: 500 },
    { year: 1996, name: "Kunta", sex: "M", count: 5 },
  ];
  const s = groupSeries(rows);
  assert.equal(s.size, 1);
  assert.deepEqual(s.get("kunta|M"), { 1995: 500, 1996: 5 });
});

test("detects a flash flood: spike at debut then decay", () => {
  const { series, display } = seriesFrom([["Zula", "F", { 1995: 500, 1996: 40, 2000: 6 }]]);
  const result = computeFlashFloods(series, display, OPTS);
  assert.equal(result.members.length, 1);
  const m = result.members[0]!;
  assert.equal(m.name, "Zula");
  assert.equal(m.firstYear, 1995);
  assert.equal(m.peakYear, 1995);
  assert.equal(m.peakCount, 500);
});

test("detects a late surge on an old name (Arsenio pattern)", () => {
  const s: Record<number, number> = {};
  for (let y = 1913; y <= 1986; y++) s[y] = 10;
  s[1987] = 83;
  s[1988] = 124; // 31% of 397 — below runupRatio
  s[1989] = 397;
  s[1990] = 188;
  s[1994] = 15;
  const { series, display } = seriesFrom([["Arsenio", "M", s]]);
  const result = computeFlashFloods(series, display, OPTS);
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0]!.peakYear, 1989);
});

test("excludes a steady riser that peaks late", () => {
  const s: Record<number, number> = {};
  for (let y = 1990; y <= 2005; y++) s[y] = 10 + (y - 1990) * 30;
  s[2005] = 400;
  s[2010] = 350; // still >20% of peak at decay horizon
  const { series, display } = seriesFrom([["Riser", "M", s]]);
  assert.equal(computeFlashFloods(series, display, OPTS).members.length, 0);
});

test("excludes a big peak that does not decay", () => {
  const { series, display } = seriesFrom([
    ["Stayer", "F", { 1995: 500, 1996: 480, 2000: 440 }],
  ]);
  assert.equal(computeFlashFloods(series, display, OPTS).members.length, 0);
});

test("excludes a survivor (Khloe pattern): decays but stays above ratio", () => {
  const { series, display } = seriesFrom([
    ["Survivor", "F", { 2007: 447, 2008: 1715, 2009: 3459, 2010: 5412, 2015: 3006 }],
  ]);
  // peak 2010=5412, decay at 2015=3006 > 20% → excluded even though run-up was sudden
  assert.equal(computeFlashFloods(series, display, OPTS).members.length, 0);
});

test("excludes peaks whose decay window is unresolved (dataMaxYear)", () => {
  const { series, display } = seriesFrom([["Recent", "F", { 2020: 10, 2021: 500, 2022: 20 }]]);
  assert.equal(computeFlashFloods(series, display, OPTS).members.length, 0);
  // but with a later dataMaxYear it resolves (absence = 0)
  assert.equal(
    computeFlashFloods(series, display, { ...OPTS, dataMaxYear: 2026 }).members.length,
    1,
  );
});

test("boundary: peak exactly at minPeak counts; below does not", () => {
  const flood = (peak: number) =>
    seriesFrom([["Edge", "M", { 1995: peak, 1996: 5, 2000: 1 }]]);
  assert.equal(computeFlashFloods(flood(100).series, flood(100).display, OPTS).members.length, 1);
  assert.equal(computeFlashFloods(flood(99).series, flood(99).display, OPTS).members.length, 0);
});

test("orders members by peakCount desc and respects nothing else", () => {
  const { series, display } = seriesFrom([
    ["Big", "F", { 1995: 900, 1996: 10, 2000: 2 }],
    ["Small", "F", { 1996: 800, 1997: 10, 2001: 2 }],
  ]);
  const all = computeFlashFloods(series, display, OPTS);
  assert.deepEqual(all.members.map((m) => m.name), ["Big", "Small"]);
});

test("evaluateClaims resolves numeric and string claims", () => {
  const def: ContentDefinition = {
    slug: "t", kind: "both", title: "T", description: "d",
    sourceVersion: "v", rolloutState: "draft",
    compute: { family: "flash-floods" },
    claims: {
      count: (m) => m.length,
      top: (m) => m[0]?.name ?? "none",
      totalNames: (_m, meta) => meta.totalNames,
    },
  };
  const { series, display } = seriesFrom([["Zed", "F", { 1995: 500, 1996: 5, 2000: 1 }]]);
  const result = computeFlashFloods(series, display, OPTS);
  const claims = evaluateClaims(def, result);
  assert.equal(claims.count, 1);
  assert.equal(claims.top, "Zed");
  assert.equal(claims.totalNames, 1);
});

test("verifyAsserts flags drift and missing keys", () => {
  const def: ContentDefinition = {
    slug: "t", kind: "both", title: "T", description: "d",
    sourceVersion: "v", rolloutState: "draft",
    compute: { family: "flash-floods" },
    claims: { peak: (m) => m[0]?.peakCount ?? 0 },
    asserts: [{ key: "peak", equals: 999 }],
  };
  const v = verifyAsserts(def, { peak: 500 });
  assert.equal(v.length, 1);
  assert.match(v[0]!, /expected 999/);

  const ok: ContentDefinition = {
    ...def,
    asserts: [{ key: "peak", approx: [500, 1] }, { key: "missing", equals: 1 }],
  };
  const v2 = verifyAsserts(ok, { peak: 500 });
  assert.equal(v2.length, 1);
  assert.match(v2[0]!, /not found/);
});

test("interpolateBody replaces claims and panels, throws on leftovers", () => {
  const out = interpolateBody(
    "Top name {{claim:top}} with {{claim:n}} floods.\n{{panel:Zula.F}}",
    { top: "Zula", n: 1 },
    { "Zula.F": "<svg></svg>" },
  );
  assert.match(out, /Top name Zula with 1 floods/);
  assert.match(out, /<svg>/);

  assert.throws(() => interpolateBody("x {{claim:nope}}", {}, {}));
  assert.throws(() => interpolateBody("x {{panel:nope}}", { a: 1 }, {}));
  assert.throws(() => interpolateBody("x {{weird}}", { a: 1 }, {}));
});

test("chartPanelHtml embeds an SVG sparkline with caption", () => {
  const member: FlashFloodMember = {
    name: "Zula", sex: "F",
    firstYear: 1995, peakYear: 1995, peakCount: 500,
    lastYear: 2000, lastCount: 6,
    series: { 1995: 500, 1996: 40, 2000: 6 },
  };
  const html = chartPanelHtml({ member, dataMaxYear: 2025 });
  assert.match(html, /<svg/);
  assert.match(html, /Zula/);
  assert.match(html, /Peak 1995/);
});

test("SSA CSV pipeline: parse, totals, convert to birth counts", () => {
  const csv = 'year,name,percent,sex\n1977,"Kunta",0.000126,"boy"\n';
  const totalsCsv = "year,male,female,total\n1977,1679000,1675764,3354764\n";
  const rows = parseSsaCsv(csv);
  const totals = parseTotalsCsv(totalsCsv);
  const ny = csvToNameYearRows(rows, totals);
  assert.equal(ny.length, 1);
  assert.equal(ny[0]!.sex, "M");
  assert.equal(ny[0]!.count, 212); // 0.000126 × 1,679,000 = 211.55 → 212
});
