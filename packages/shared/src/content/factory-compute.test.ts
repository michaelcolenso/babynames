import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeFlashFloods,
  evaluateClaims,
  interpolateBody,
  parseSsaCsv,
  parseTotalsCsv,
  verifyAsserts,
  chartPanelHtml,
  type SsaRow,
} from "./factory-compute";
import type { ContentDefinition, FlashFloodMember } from "./factory-types";

function totalsMap(entries: Array<[number, number]>): Map<number, number> {
  return new Map(entries);
}

// Fixture: totals of 1,000,000 births/year for 1990-2010 so percent*total is easy.
const T = totalsMap(
  Array.from({ length: 21 }, (_, i) => [1990 + i, 1_000_000] as [number, number]),
);

function rowsFrom(series: Record<string, number>, name: string, sex: string): SsaRow[] {
  return Object.entries(series).map(([y, births]) => ({
    year: Number(y),
    name,
    percent: births / 1_000_000,
    sex,
  }));
}

test("parseSsaCsv skips header and blank lines", () => {
  const csv = "year,name,percent,sex\n2000,Bob,0.01,M\n\n";
  const rows = parseSsaCsv(csv);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { year: 2000, name: "Bob", percent: 0.01, sex: "M" });
});

test("parseTotalsCsv reads year,total", () => {
  const t = parseTotalsCsv("year,male,female,total\n2000,100,100,200\n");
  assert.equal(t.get(2000), 200);
});

test("detects a flash flood: spike at debut then decay", () => {
  const rows = rowsFrom(
    { 1995: 500, 1996: 40, 1997: 12, 1998: 6 },
    "Zula",
    "F",
  );
  const result = computeFlashFloods(rows, T);
  assert.equal(result.members.length, 1);
  const m = result.members[0]!;
  assert.equal(m.name, "Zula");
  assert.equal(m.firstYear, 1995);
  assert.equal(m.peakYear, 1995);
  assert.equal(m.peakCount, 500);
});

test("excludes a steady riser that peaks late", () => {
  const rows = rowsFrom(
    { 1990: 10, 1995: 50, 2000: 300, 2005: 400 },
    "Riser",
    "M",
  );
  const result = computeFlashFloods(rows, T);
  assert.equal(result.members.length, 0);
});

test("excludes a big peak that does not decay", () => {
  const rows = rowsFrom(
    { 1995: 500, 1996: 480, 1997: 470, 1998: 460, 1999: 450, 2000: 440 },
    "Stayer",
    "F",
  );
  const result = computeFlashFloods(rows, T);
  assert.equal(result.members.length, 0);
});

test("boundary: peak exactly at minPeak counts; below does not", () => {
  const spike = { 1995: 100, 1996: 5 };
  const below = { 1995: 99, 1996: 5 };
  const r1 = computeFlashFloods(rowsFrom(spike, "Edge", "M"), T);
  const r2 = computeFlashFloods(rowsFrom(below, "Edge", "M"), T);
  assert.equal(r1.members.length, 1);
  assert.equal(r2.members.length, 0);
});

test("boundary: peak within peakWindow (2 years) counts; 3 years does not", () => {
  const near = { 1993: 10, 1994: 20, 1995: 500, 1996: 5 };
  const far = { 1992: 10, 1993: 10, 1994: 10, 1995: 500, 1996: 5 };
  assert.equal(computeFlashFloods(rowsFrom(near, "Near", "F"), T).members.length, 1);
  assert.equal(computeFlashFloods(rowsFrom(far, "Far", "F"), T).members.length, 0);
});

test("decay checked at peakYear+decayYears using nearest known year", () => {
  // Peak 1995, decay target 2000 — series jumps 1999 -> 2001.
  const rows = rowsFrom({ 1995: 400, 1996: 60, 1999: 30, 2001: 10 }, "Gap", "F");
  const result = computeFlashFloods(rows, T);
  assert.equal(result.members.length, 1);
});

test("orders members by peakCount desc and respects limit", () => {
  const rows = [
    ...rowsFrom({ 1995: 900, 1996: 10 }, "Big", "F"),
    ...rowsFrom({ 1996: 800, 1997: 10 }, "Small", "F"),
  ];
  const all = computeFlashFloods(rows, T);
  assert.deepEqual(all.members.map((m) => m.name), ["Big", "Small"]);
  const limited = computeFlashFloods(rows, T, { family: "flash-floods", limit: 1 });
  assert.equal(limited.members.length, 1);
  assert.equal(limited.members[0]!.name, "Big");
});

test("groups by lowercase name but keeps first display form", () => {
  const rows: SsaRow[] = [
    { year: 1995, name: "KUNTA", percent: 0.0005, sex: "M" },
    { year: 1995, name: "Kunta", percent: 0.0005, sex: "M" },
    { year: 2000, name: "Kunta", percent: 0.00001, sex: "M" },
  ];
  const result = computeFlashFloods(rows, T);
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0]!.name, "KUNTA"); // first occurrence wins
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
  const result = computeFlashFloods(rowsFrom({ 1995: 500, 1996: 5 }, "Zed", "F"), T);
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
  const evaluated = { peak: 500 };
  const v = verifyAsserts(def, evaluated);
  assert.equal(v.length, 1);
  assert.match(v[0]!, /expected 999/);

  const ok: ContentDefinition = {
    ...def,
    asserts: [{ key: "peak", approx: [500, 1] }, { key: "missing", equals: 1 }],
  };
  const v2 = verifyAsserts(ok, evaluated);
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
    lastYear: 1998, lastCount: 6,
    series: { 1995: 500, 1996: 40, 1997: 12, 1998: 6 },
  };
  const html = chartPanelHtml({ member, dataMaxYear: 2025 });
  assert.match(html, /<svg/);
  assert.match(html, /Zula/);
  assert.match(html, /Peak 1995/);
});
