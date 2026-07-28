// Spelling-families suite: CSV-only curation, aggregation, and the guardrails
// that keep weak families off the page (SPEC §6, §13).

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSpellingFamilies,
  parseSpellingFamiliesCsv,
} from "../packages/shared/src/decade-hub-compute";
import type { SourceNameRecord } from "../packages/shared/src/decade-hub-compute";

const HEADER = "family_id,label,canonical,variant,review_status,rationale";

function series(entries: [number, number][]): Record<number, number> {
  return Object.fromEntries(entries);
}

function decadeSeries(perYear: number): Record<number, number> {
  return series([1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989].map((y) => [y, perYear] as [number, number]));
}

function fixtureRecords(): SourceNameRecord[] {
  return [
    { name: "Alpha", sex: "F", series: decadeSeries(3000) }, // 30,000
    { name: "Alfa", sex: "F", series: decadeSeries(1000) }, // 10,000
    { name: "Alphah", sex: "F", series: decadeSeries(500) }, // 5,000
    { name: "Beta", sex: "F", series: decadeSeries(2500) }, // 25,000
    { name: "Betta", sex: "F", series: decadeSeries(100) }, // 1,000 (below variant floor)
    { name: "Gamma", sex: "F", series: decadeSeries(150) }, // 1,500
    { name: "Gama", sex: "F", series: decadeSeries(150) }, // 1,500 (family total below floor)
    { name: "Delta", sex: "M", series: decadeSeries(4000) }, // male-only name
    { name: "Alpha", sex: "M", series: decadeSeries(5) }, // cross-sex trace
  ];
}

test("parser enforces the exact header and reads quoted rationale", () => {
  const csv = `${HEADER}\nalpha,Alpha family,Alpha,Alpha,approved,"Grouped, because spellings split."\nalpha,Alpha family,Alpha,Alfa,approved,"Grouped, because spellings split."`;
  const rows = parseSpellingFamiliesCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.rationale, "Grouped, because spellings split.");
  assert.throws(() => parseSpellingFamiliesCsv("a,b,c\n1,2,3"));
});

test("approved family aggregates variants, computes combined rank and shares", () => {
  const csv = [
    HEADER,
    `alpha,Alpha family,Alpha,Alpha,approved,"r"`,
    `alpha,Alpha family,Alpha,Alfa,approved,"r"`,
    `alpha,Alpha family,Alpha,Alphah,approved,"r"`,
  ].join("\n");
  const { families, skipped } = buildSpellingFamilies(csv, fixtureRecords());
  assert.deepEqual(skipped, []);
  assert.equal(families.length, 1);
  const fam = families[0]!;
  assert.equal(fam.totalBirthsInDecade, 45000);
  assert.equal(fam.dominantVariant, "Alpha");
  assert.equal(fam.variants.length, 3);
  const alpha = fam.variants.find((v) => v.name === "Alpha")!;
  assert.equal(alpha.shareOfFamily, 30000 / 45000);
  // combined rank: Delta(M) is in another sex table; within F, no single name
  // beats 45,000, so the family total would rank #1.
  assert.equal(fam.combinedDecadeRank, 1);
  // yearly series has 10 points with per-variant + total keys
  assert.equal(fam.yearly.length, 10);
  assert.equal(fam.yearly[0]!.year, 1980);
  assert.equal(fam.yearly[4]!.total, 4500);
  assert.equal(fam.peakYear, 1980); // flat series → first year wins deterministically
});

test("family with a variant under the 1,000-birth floor is skipped with a reason", () => {
  const csv = [
    HEADER,
    `beta,Beta family,Beta,Beta,approved,"r"`,
    `beta,Beta family,Beta,Betta,approved,"r"`,
  ].join("\n");
  const { families, skipped } = buildSpellingFamilies(csv, fixtureRecords());
  assert.equal(families.length, 0);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0]!.reason, /Betta/);
});

test("family under the 20,000 combined floor is skipped", () => {
  const csv = [
    HEADER,
    `gamma,Gamma family,Gamma,Gamma,approved,"r"`,
    `gamma,Gamma family,Gamma,Gama,approved,"r"`,
  ].join("\n");
  const { families, skipped } = buildSpellingFamilies(csv, fixtureRecords());
  assert.equal(families.length, 0);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0]!.reason, /combined/);
});

test("non-approved rows are excluded before any aggregation", () => {
  const csv = [
    HEADER,
    `alpha,Alpha family,Alpha,Alpha,approved,"r"`,
    `alpha,Alpha family,Alpha,Alfa,approved,"r"`,
    `alpha,Alpha family,Alpha,Alphah,needs_review,"r"`,
  ].join("\n");
  const { families } = buildSpellingFamilies(csv, fixtureRecords());
  assert.equal(families.length, 1);
  assert.equal(families[0]!.variants.length, 2, "the needs_review variant is dropped");
  assert.equal(families[0]!.totalBirthsInDecade, 40000);
});

test("duplicate variant rows within a family are de-duplicated", () => {
  const csv = [
    HEADER,
    `alpha,Alpha family,Alpha,Alpha,approved,"r"`,
    `alpha,Alpha family,Alpha,Alpha,approved,"r"`,
    `alpha,Alpha family,Alpha,Alfa,approved,"r"`,
  ].join("\n");
  const { families } = buildSpellingFamilies(csv, fixtureRecords());
  assert.equal(families[0]!.variants.length, 2);
});

test("family sex table follows the dominant sex of the canonical variant", () => {
  // Alpha F has 30,000 vs Alpha M 50 → family ranks inside the female table.
  const csv = [
    HEADER,
    `alpha,Alpha family,Alpha,Alpha,approved,"r"`,
    `alpha,Alpha family,Alpha,Alfa,approved,"r"`,
  ].join("\n");
  const { families } = buildSpellingFamilies(csv, fixtureRecords());
  const fam = families[0]!;
  assert.equal(fam.totalBirthsInDecade, 40000);
  // In the F table, nobody exceeds 40,000 → combined rank 1. (If the M table
  // had been used, Delta's 40,000 would still not exceed it — this assertion
  // pins the sex-table choice via the F-only variant Alfa being counted.)
  assert.equal(fam.combinedDecadeRank, 1);
});

test("families sort by total births desc, then id", () => {
  const csv = [
    HEADER,
    `alpha,Alpha family,Alpha,Alpha,approved,"r"`,
    `alpha,Alpha family,Alpha,Alfa,approved,"r"`,
    `beta,Beta family,Beta,Beta,approved,"r"`,
    `beta,Beta family,Beta,Beta2,approved,"r"`,
  ].join("\n");
  const records = [
    ...fixtureRecords(),
    { name: "Beta2", sex: "F" as const, series: decadeSeries(2000) }, // beta total 45,000 > alpha 40,000
  ];
  const { families } = buildSpellingFamilies(csv, records);
  assert.deepEqual(families.map((f) => f.id), ["beta", "alpha"]);
});
