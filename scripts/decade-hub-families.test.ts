// Spelling-family tests (SPEC §6 / §11, Coder A). The curated CSV is the single
// source of truth; families ship only with >= 2 approved variants each with
// >= 1,000 decade births and combined >= 20,000, verified against real data.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { SourceNameRecord } from "../packages/shared/src/decade-hub-compute";
import {
  DECADE_END,
  DECADE_START,
  FAMILY_MIN_TOTAL_BIRTHS,
  FAMILY_MIN_VARIANT_BIRTHS,
  FAMILY_MIN_VARIANTS,
  buildSpellingFamilies,
  parseCsv,
  parseSpellingFamiliesCsv,
} from "../packages/shared/src/decade-hub-compute";
import { loadShardSource } from "./build-decade-hub";

const FAMILIES_CSV_PATH = new URL("../data/manual/spelling-families.csv", import.meta.url);

function rec(name: string, sex: "F" | "M", series: Record<number, number>): SourceNameRecord {
  return { name, sex, series };
}

test("CSV parser: quoted fields, commas, doubled quotes", () => {
  const rows = parseCsv('a,b,c\n1,"x, y","say ""hi"""\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["1", "x, y", 'say "hi"']]);
});

test("header enforced; only approved rows used", () => {
  assert.throws(() => parseSpellingFamiliesCsv("wrong,header\n"), /header/);
  const csv =
    "family_id,label,canonical,variant,review_status,rationale\n" +
    "f1,Fam One,Va,Va,approved,ok\n" +
    "f2,Fam Two,Vb,Vb,pending,not reviewed\n";
  const rows = parseSpellingFamiliesCsv(csv);
  assert.equal(rows.length, 2);
  const records = [rec("Va", "F", { 1984: 5000 }), rec("Vb", "F", { 1984: 5000 })];
  const { families, skipped } = buildSpellingFamilies(csv, records);
  assert.equal(families.length, 0); // f1 has < 2 variants; f2 is pending
  assert.ok(skipped.some((s) => s.familyId === "f1"));
  assert.ok(!skipped.some((s) => s.familyId === "f2")); // pending rows never reach evaluation
});

test("combined totals, variant ranks, combined rank arithmetic on a fixture", () => {
  // F decade table by births: Top1 50k, Top2 40k, Top3 30k, Va 11k, Below 10k, Other 9.8k, Vb 9.5k
  const records: SourceNameRecord[] = [
    rec("Top1", "F", { 1984: 50000 }),
    rec("Top2", "F", { 1984: 40000 }),
    rec("Top3", "F", { 1984: 30000 }),
    rec("Va", "F", { 1982: 4000, 1984: 7000 }), // 11000 in decade
    rec("Vb", "F", { 1985: 9500 }),
    rec("Below", "F", { 1984: 10000 }),
    rec("Other", "F", { 1984: 9800 }),
  ];
  const csv =
    "family_id,label,canonical,variant,review_status,rationale\n" +
    "testfam,Test family,Va,Va,approved,fixture family\n" +
    "testfam,Test family,Va,Vb,approved,fixture family\n";
  const { families, skipped } = buildSpellingFamilies(csv, records);
  assert.equal(skipped.length, 0);
  assert.equal(families.length, 1);
  const fam = families[0]!;
  assert.equal(fam.id, "testfam");
  assert.equal(fam.label, "Test family");
  assert.equal(fam.canonicalDisplayName, "Va");
  assert.equal(fam.reviewStatus, "approved");
  // totals == Σ variant totals
  assert.equal(fam.totalBirthsInDecade, 11000 + 9500);
  assert.equal(
    fam.variants.reduce((a, v) => a + v.birthsInDecade, 0),
    fam.totalBirthsInDecade,
  );
  // variant decade ranks in the F table: Top1..Top3, Va, Below, Other, Vb
  const va = fam.variants.find((v) => v.name === "Va")!;
  const vb = fam.variants.find((v) => v.name === "Vb")!;
  assert.equal(va.decadeRank, 4);
  assert.equal(vb.decadeRank, 7);
  // combined rank = 1 + #names strictly above 20,500 -> Top1, Top2, Top3 => 4
  assert.equal(fam.combinedDecadeRank, 4);
  assert.equal(fam.dominantVariant, "Va");
  // shares sum to 1 (within rounding)
  const shareSum = fam.variants.reduce((a, v) => a + v.shareOfFamily, 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-5);
  // yearly: 10 points, totals == Σ variants per year; peak year correct
  assert.equal(fam.yearly.length, 10);
  assert.equal(fam.yearly[0]!.year, DECADE_START);
  assert.equal(fam.yearly[9]!.year, DECADE_END);
  for (const p of fam.yearly) {
    assert.equal(p.total, (p["Va"] ?? 0) + (p["Vb"] ?? 0));
  }
  assert.equal(fam.yearly.find((p) => p.year === 1984)!.total, 7000);
  assert.equal(fam.peakYear, 1985); // Vb 9500 alone beats every other year
});

test("thresholds: weak variant or weak combined total -> family skipped", () => {
  const records: SourceNameRecord[] = [
    rec("Big1", "F", { 1984: 9000 }),
    rec("Big2", "F", { 1984: 9000 }),
    rec("Tiny", "F", { 1984: 500 }), // < 1000 variant minimum
    rec("Mid1", "F", { 1984: 1500 }),
    rec("Mid2", "F", { 1984: 1500 }), // combined 3000 < 20000 minimum
  ];
  const csv =
    "family_id,label,canonical,variant,review_status,rationale\n" +
    "weakvar,Weak variant,Big1,Big1,approved,r\n" +
    "weakvar,Weak variant,Big1,Tiny,approved,r\n" +
    "weaksum,Weak sum,Mid1,Mid1,approved,r\n" +
    "weaksum,Weak sum,Mid1,Mid2,approved,r\n";
  const { families, skipped } = buildSpellingFamilies(csv, records);
  assert.equal(families.length, 0);
  assert.ok(skipped.find((s) => s.familyId === "weakvar")!.reason.includes("Tiny"));
  assert.ok(skipped.find((s) => s.familyId === "weaksum")!.reason.includes("combined"));
});

test("real CSV: variants exist, no duplicates across families, ids stable, totals consistent", async () => {
  const { source } = await loadShardSource();
  const csvText = await readFile(FAMILIES_CSV_PATH, "utf8");
  const rows = parseSpellingFamiliesCsv(csvText);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.reviewStatus === "approved"));

  // no variant appears in two approved families
  const variantOwner = new Map<string, string>();
  for (const r of rows) {
    const key = r.variant.toLowerCase();
    assert.ok(!variantOwner.has(key), `${r.variant} appears in two families (${variantOwner.get(key)}, ${r.familyId})`);
    variantOwner.set(key, r.familyId);
  }

  const { families, skipped } = buildSpellingFamilies(csvText, source.records);
  assert.deepEqual(skipped, []);
  assert.ok(families.length >= 4 && families.length <= 6, "SPEC §6: ship 4–6 families");

  // stable ids: sorted unique ids from the CSV, all shipped
  const csvIds = [...new Set(rows.map((r) => r.familyId))].sort();
  assert.deepEqual(families.map((f) => f.id).sort(), csvIds);

  const birthsOf = (name: string, sex: "F" | "M") => {
    const r = source.records.find((x) => x.name === name && x.sex === sex);
    if (!r) return 0;
    let b = 0;
    for (let y = DECADE_START; y <= DECADE_END; y++) b += r.series[y] ?? 0;
    return b;
  };

  for (const fam of families) {
    // every variant exists in source data with the minimum volume
    assert.ok(fam.variants.length >= FAMILY_MIN_VARIANTS);
    for (const v of fam.variants) {
      const b = birthsOf(v.name, "F") || birthsOf(v.name, "M");
      assert.ok(b > 0, `${v.name} must exist in source data`);
      assert.ok(v.birthsInDecade >= FAMILY_MIN_VARIANT_BIRTHS);
    }
    assert.ok(fam.totalBirthsInDecade >= FAMILY_MIN_TOTAL_BIRTHS);
    // family totals == Σ variant totals
    assert.equal(
      fam.variants.reduce((a, v) => a + v.birthsInDecade, 0),
      fam.totalBirthsInDecade,
    );
    // canonical is among the variants; dominant variant has the max births
    assert.ok(fam.variants.some((v) => v.name === fam.canonicalDisplayName));
    const maxBirths = Math.max(...fam.variants.map((v) => v.birthsInDecade));
    assert.equal(fam.variants.find((v) => v.name === fam.dominantVariant)!.birthsInDecade, maxBirths);
    // combined rank must beat the canonical's individual rank
    const canonical = fam.variants.find((v) => v.name === fam.canonicalDisplayName)!;
    assert.ok(fam.combinedDecadeRank < (canonical.decadeRank ?? Infinity));
    // yearly series sane
    assert.equal(fam.yearly.length, 10);
    for (const p of fam.yearly) {
      const sum = fam.variants.reduce((a, v) => a + (p[v.name] ?? 0), 0);
      assert.equal(p.total, sum);
    }
    assert.ok(fam.peakYear >= DECADE_START && fam.peakYear <= DECADE_END);
  }
});
