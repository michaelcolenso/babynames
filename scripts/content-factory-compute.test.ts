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
} from "../packages/shared/src/content/factory-compute";
import type { ContentDefinition, FlashFloodMember } from "../packages/shared/src/content/factory-types";

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

// ---- Glaciers (slow rise / slow fall) ----

import { computeGlaciers } from "../packages/shared/src/content/factory-compute";

const GLOPTS = { dataMaxYear: 2025 };

function glacierSeries(
  riseStart: number,
  peakYear: number,
  peak: number,
  fallEnd: number,
): Record<number, number> {
  const s: Record<number, number> = {};
  for (let y = riseStart; y <= fallEnd; y++) {
    const t = y <= peakYear ? (y - riseStart) / (peakYear - riseStart) : (fallEnd - y) / (fallEnd - peakYear);
    s[y] = Math.max(5, Math.round(peak * Math.max(t, 0.09)));
  }
  s[peakYear] = peak;
  return s;
}

test("detects a glacier: slow rise and slow fall", () => {
  const { series, display } = seriesFrom([["Glacia", "F", glacierSeries(1950, 1980, 8000, 2015)]]);
  const result = computeGlaciers(series, display, GLOPTS);
  assert.equal(result.members.length, 1);
  const m = result.members[0]!;
  assert.equal(m.name, "Glacia");
  assert.equal(m.peakYear, 1980);
  assert.equal(m.peakCount, 8000);
  assert.equal(m.riseStartYear, 1953); // first year at >=10% of peak
  assert.equal(m.fallEndYear, 2011); // last year at >=10% of peak
});

test("excludes a name whose rise is too fast", () => {
  const { series, display } = seriesFrom([["Quick", "M", glacierSeries(1970, 1980, 9000, 2015)]]);
  assert.equal(computeGlaciers(series, display, GLOPTS).members.length, 0);
});

test("excludes a name whose fall is too fast or unresolved", () => {
  const fastFall = { ...glacierSeries(1950, 1980, 8000, 2000), 2024: 5 };
  const { series, display } = seriesFrom([["FastFall", "F", fastFall]]);
  assert.equal(computeGlaciers(series, display, GLOPTS).members.length, 0);

  // Fall still in progress at dataMaxYear → excluded.
  const { series: s2, display: d2 } = seriesFrom([
    [
      "Unresolved",
      "F",
      { ...glacierSeries(1950, 1980, 8000, 2015), 2023: 1500, 2024: 1400, 2025: 1300 },
    ],
  ]);
  assert.equal(computeGlaciers(s2, d2, GLOPTS).members.length, 0);
});

test("excludes a peak below minPeak", () => {
  const { series, display } = seriesFrom([["Hill", "F", glacierSeries(1950, 1980, 4000, 2015)]]);
  assert.equal(computeGlaciers(series, display, GLOPTS).members.length, 0);
});

test("orders glaciers by peakCount desc", () => {
  const a = seriesFrom([["Big", "F", glacierSeries(1950, 1980, 9000, 2015)]]);
  const b = seriesFrom([["Small", "F", glacierSeries(1900, 1930, 6000, 1965)]]);
  const merged = new Map([...a.series, ...b.series]);
  const disp = new Map([...a.display, ...b.display]);
  const all = computeGlaciers(merged, disp, GLOPTS);
  assert.deepEqual(all.members.map((m) => m.name), ["Big", "Small"]);
});

// ---- Grandmother names (living population aged 50+) ----

import { computeGrandmotherNames } from "../packages/shared/src/content/factory-compute";
import type { GrandmotherMember } from "../packages/shared/src/content/factory-types";
import type { SurvivalTable } from "../packages/shared/src/life-table";

// Sparse checkpoints, same shape as data/manual/life-table.csv.
const LIFE: SurvivalTable = {
  M: [
    [0, 1],
    [10, 0.99],
    [20, 0.98],
    [50, 0.9],
    [70, 0.6],
    [90, 0.3],
    [119, 0],
  ],
  F: [
    [0, 1],
    [10, 0.99],
    [20, 0.98],
    [50, 0.9],
    [70, 0.6],
    [90, 0.3],
    [119, 0],
  ],
};

// 1940 births sit at age 86 in 2026 (survival 0.36 → 3,000 births ≈ 1,080 living, all 50+).
const OLD: Record<number, number> = { 1940: 3000 };
// 2025 births sit at age 1 — the same pool, at the other end of the age range.
const YOUNG: Record<number, number> = { 2025: 5000 };
// Half old, half young: 1,474 living across ages 76 and 26, ~35% aged 50+.
const SPLIT: Record<number, number> = { 1950: 1000, 2000: 1000 };

test("grandmother names: detects an old living population and ignores a young one", () => {
  const { series, display } = seriesFrom([
    ["Olda", "F", OLD],
    ["Newa", "F", YOUNG],
    ["Half", "F", SPLIT],
  ]);
  const result = computeGrandmotherNames(series, display, LIFE, { minLiving: 1000 });
  assert.deepEqual(result.members.map((m) => m.name), ["Olda"]);
  assert.equal(result.atFloor, 3);
  assert.equal(result.totalNames, 3);

  const olda = result.members[0]!;
  assert.equal(olda.livingEst, 1080); // 3,000 × 0.36
  assert.equal(olda.medianAge, 86);
  assert.equal(olda.over50Share, 1);
  assert.equal(olda.peakYear, 1940);
  assert.equal(olda.peakCount, 3000);

  // The contrast case is the youngest name at or above the living floor.
  assert.equal(result.youngest?.name, "Newa");
  assert.equal(result.youngest?.medianAge, 1);
});

test("grandmother names: living floor and 50+ share are both enforced", () => {
  const { series, display } = seriesFrom([
    ["Olda", "F", OLD],
    ["Newa", "F", YOUNG],
    ["Half", "F", SPLIT],
  ]);

  // Olda (1,080) is under a 2,000 floor; Newa (4,995) is over it but young.
  const high = computeGrandmotherNames(series, display, LIFE, { minLiving: 2000 });
  assert.deepEqual(high.members, []);

  // Half is 35% aged 50+, so a 30% bar takes it and a 90% bar does not.
  assert.deepEqual(
    computeGrandmotherNames(series, display, LIFE, { minLiving: 1000, minOver50Share: 0.3 })
      .members.map((m) => m.name),
    ["Half", "Olda"], // sorted by living population, not by age
  );
  assert.deepEqual(
    computeGrandmotherNames(series, display, LIFE, { minLiving: 1000, minOver50Share: 0.9 })
      .members.map((m) => m.name),
    ["Olda"],
  );
});

test("grandmother names: omitted options fall back to the defaults, not to undefined", () => {
  // The CLI passes `undefined` for every option a definition leaves out; a
  // spread of those would age every cohort against a NaN reference year.
  const { series, display } = seriesFrom([["Olda", "F", OLD]]);
  const explicitUndefined = computeGrandmotherNames(series, display, LIFE, {
    minLiving: 1000,
    minOver50Share: undefined,
    analysisYear: undefined,
  });
  assert.deepEqual(explicitUndefined.members.map((m) => m.name), ["Olda"]);
  assert.equal(explicitUndefined.analysisYear, 2026);
  assert.throws(
    () => computeGrandmotherNames(series, display, LIFE, { analysisYear: Number.NaN }),
    /invalid analysisYear/,
  );
});

test("grandmother names: sexes are aged against their own survival rows and sorted by living", () => {
  const table: SurvivalTable = { ...LIFE, M: [[0, 1], [119, 1]] }; // men survive everything
  const { series, display } = seriesFrom([
    ["Olda", "F", OLD],
    ["Oldo", "M", OLD],
  ]);
  const result = computeGrandmotherNames(series, display, table, { minLiving: 1000 });
  assert.deepEqual(result.members.map((m) => `${m.name}|${m.sex}`), ["Oldo|M", "Olda|F"]);
  assert.equal(result.members[0]!.livingEst, 3000); // full survival
  assert.equal(result.members[1]!.livingEst, 1080);
  assert.throws(
    () => computeGrandmotherNames(series, display, { M: [], F: [] }, { minLiving: 1000 }),
    /missing M or F rows/,
  );
});

test("grandmother names: boys between the near-miss floor and the living floor are reported", () => {
  const { series, display } = seriesFrom([
    ["Olda", "F", OLD], // 1,080 living — a member at a 1,000 floor
    ["Nicky", "M", { 1940: 1200 }], // 432 living — clears the 50+ share, below the floor
    ["Newa", "F", YOUNG], // young, so never a near-miss
  ]);
  const result = computeGrandmotherNames(series, display, LIFE, {
    minLiving: 1000,
    nearMissFloor: 400,
  });
  assert.deepEqual(result.members.map((m) => m.name), ["Olda"]);
  assert.deepEqual(result.maleNearMisses.map((m) => m.name), ["Nicky"]);
  assert.equal(result.nearMissFloor, 400);
  assert.equal(result.atFloor, 2); // Olda and Newa are at the floor; Nicky is not

  // Below the near-miss floor the name is not even scored.
  const strict = computeGrandmotherNames(series, display, LIFE, {
    minLiving: 1000,
    nearMissFloor: 500,
  });
  assert.deepEqual(strict.maleNearMisses, []);
});

test("grandmother names: claims read members plus the result-level fields", () => {
  const def: ContentDefinition = {
    slug: "t", kind: "both", title: "T", description: "d",
    sourceVersion: "v", rolloutState: "draft",
    compute: { family: "grandmother-names" },
    claims: {
      count: (m) => m.length,
      youngestName: (_m, meta) => meta.youngest?.name ?? "none",
      youngestMedianAge: (_m, meta) => meta.youngest?.medianAge ?? 0,
      atFloor: (_m, meta) => meta.atFloor ?? -1,
      combinedLiving: (m) => (m as GrandmotherMember[]).reduce((s, x) => s + x.livingEst, 0),
    },
    asserts: [{ key: "youngestName", equals: "Newa" }, { key: "count", equals: 1 }],
  };
  const { series, display } = seriesFrom([
    ["Olda", "F", OLD],
    ["Newa", "F", YOUNG],
  ]);
  const result = computeGrandmotherNames(series, display, LIFE, { minLiving: 1000 });
  const claims = evaluateClaims(def, result);
  assert.equal(claims.count, 1);
  assert.equal(claims.youngestName, "Newa");
  assert.equal(claims.youngestMedianAge, 1);
  assert.equal(claims.atFloor, 2);
  assert.equal(claims.combinedLiving, 1080);
  assert.deepEqual(verifyAsserts(def, claims), []);
});
