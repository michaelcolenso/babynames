// Ownership + profile tests for the decade hub (SPEC §11, Coder A).
// Fixture tests use hand-recomputed numbers; integration tests run the real
// tracked-shard data and assert SPEC §3 validation expectations WITHOUT
// hardcoding winners into the source under test.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { SourceNameRecord } from "../packages/shared/src/decade-hub-compute";
import {
  DECADE_END,
  DECADE_HUB_ALPHA,
  DECADE_START,
  ELIGIBILITY_MIN_BIRTHS,
  OWNERSHIP_WEIGHT_CONCENTRATION,
  OWNERSHIP_WEIGHT_PROMINENCE,
  assertSanityAnchors,
  buildDecadeProfile,
  computeOwnership,
  computeTop1000Years,
  isEligible,
  stableStringify,
  summarizeRecord,
} from "../packages/shared/src/decade-hub-compute";
import { DECADE_HUB_METHODOLOGY_VERSION } from "../packages/shared/src/decade-hub-types";
import { loadShardSource } from "./build-decade-hub";

const FAMILIES_CSV_PATH = new URL("../data/manual/spelling-families.csv", import.meta.url);

function rec(name: string, sex: "F" | "M", series: Record<number, number>): SourceNameRecord {
  return { name, sex, series };
}

// ---------------------------------------------------------------------------
// fixture: ownership math recomputed by hand
// ---------------------------------------------------------------------------

// F: Era    {1984:6000}                  decade 6000, lifetime 6000
// F: Classic{1900:50000, 1984:5000}      decade 5000, lifetime 55000
// F: Small  {1984:4999}                  ineligible (< 5000, < 5 top-1000 years)
// M: Boyera {1985:8000}                  decade 8000, lifetime 8000
// M: Boyclassic {1900:90000, 1985:10000} decade 10000, lifetime 100000
const FIXTURE: SourceNameRecord[] = [
  rec("Era", "F", { 1984: 6000 }),
  rec("Classic", "F", { 1900: 50000, 1984: 5000 }),
  rec("Small", "F", { 1984: 4999 }),
  rec("Boyera", "M", { 1985: 8000 }),
  rec("Boyclassic", "M", { 1900: 90000, 1985: 10000 }),
];

test("summarizeRecord: decade/lifetime totals match independent recomputation", () => {
  const era = summarizeRecord(FIXTURE[0]!, 2017);
  assert.equal(era.birthsInDecade, 6000);
  assert.equal(era.lifetimeBirths, 6000);
  assert.equal(era.rankedYearsInDecade, 1);
  assert.equal(era.firstYear, 1984);
  assert.equal(era.lastYear, 1984);
  const classic = summarizeRecord(FIXTURE[1]!, 2017);
  assert.equal(classic.birthsInDecade, 5000);
  assert.equal(classic.lifetimeBirths, 55000);
  assert.equal(classic.rankedYearsInDecade, 1);
  assert.equal(classic.peakYear, 1900);
  assert.equal(classic.peakCount, 50000);
});

test("eligibility: 5000-birth threshold, top-1000-in-5-years rule, low-volume exclusion", () => {
  const stats = FIXTURE.map((r) => summarizeRecord(r, 2017));
  const top1000 = computeTop1000Years(FIXTURE);
  assert.equal(isEligible(stats[0]!, top1000), true); // Era: 6000 >= 5000
  assert.equal(isEligible(stats[1]!, top1000), true); // Classic: 5000 >= 5000
  assert.equal(isEligible(stats[2]!, top1000), false); // Small: 4999 and only 1 ranked year

  // top-1000 rule: < 5000 decade births but top-1000 in >= 5 distinct years
  const steady = rec("Steady", "F", { 1980: 900, 1981: 900, 1982: 900, 1983: 900, 1984: 900 });
  const spotty = rec("Spotty", "F", { 1980: 900, 1981: 900, 1982: 900, 1983: 900 });
  const records = [...FIXTURE, steady, spotty];
  const top1000b = computeTop1000Years(records);
  const steadyStats = summarizeRecord(steady, 2017);
  const spottyStats = summarizeRecord(spotty, 2017);
  assert.equal(steadyStats.birthsInDecade, 4500);
  assert.equal(isEligible(steadyStats, top1000b), true);
  assert.equal(isEligible(spottyStats, top1000b), false);
});

test("prior, alpha application, normalization, and final weights (hand-recomputed)", () => {
  const stats = FIXTURE.map((r) => summarizeRecord(r, 2017));
  const top1000 = computeTop1000Years(FIXTURE);
  const alpha = 1000;
  const out = computeOwnership(stats, top1000, alpha);

  // per-sex priors over the eligible sets (Small is excluded)
  assert.ok(Math.abs(out.priorDecadeShareFemale - 11000 / 61000) < 1e-6);
  assert.ok(Math.abs(out.priorDecadeShareMale - 18000 / 108000) < 1e-6);
  assert.ok(Math.abs(out.priorDecadeSharePooled - 29000 / 169000) < 1e-6);

  // exactly 2 eligible per sex — sex-separate comparison sets
  assert.equal(out.female.length, 2);
  assert.equal(out.male.length, 2);
  assert.ok(out.female.every((r) => r.sex === "F"));
  assert.ok(out.male.every((r) => r.sex === "M"));

  const priorF = 11000 / 61000;
  const eraAdj = (6000 + alpha * priorF) / (6000 + alpha);
  const classicAdj = (5000 + alpha * priorF) / (55000 + alpha);
  const era = out.female.find((r) => r.name === "Era")!;
  const classic = out.female.find((r) => r.name === "Classic")!;
  assert.ok(Math.abs(era.adjustedConcentration - eraAdj) < 1e-5, "alpha applied in shrinkage formula");
  assert.ok(Math.abs(classic.adjustedConcentration - classicAdj) < 1e-5);
  assert.equal(era.decadeShare, 1); // raw concentration kept for transparency

  // min-max normalization bounds: max name -> 1, min name -> 0
  assert.equal(era.normalizedConcentration, 1);
  assert.equal(classic.normalizedConcentration, 0);
  assert.equal(era.normalizedProminence, 1);
  assert.equal(classic.normalizedProminence, 0);

  // final weights: 100 × (0.70·normConc + 0.30·normProm)
  assert.equal(era.ownershipScore, 100 * (OWNERSHIP_WEIGHT_CONCENTRATION + OWNERSHIP_WEIGHT_PROMINENCE));
  assert.equal(classic.ownershipScore, 0);
  assert.equal(era.ownershipRank, 1);
  assert.equal(classic.ownershipRank, 2);
  assert.equal(era.popularityRank, 1);
  assert.equal(classic.popularityRank, 2);

  // all scores/norms bounded
  for (const r of [...out.female, ...out.male]) {
    assert.ok(r.ownershipScore >= 0 && r.ownershipScore <= 100);
    assert.ok(r.normalizedConcentration >= 0 && r.normalizedConcentration <= 1);
    assert.ok(r.normalizedProminence >= 0 && r.normalizedProminence <= 1);
  }
});

test("tie-breaks are deterministic: higher births, then alphabetical name_lower", () => {
  // identical series -> identical scores; alphabetical order decides
  const records = [rec("Zed", "F", { 1984: 6000 }), rec("Ann", "F", { 1984: 6000 }), rec("Mid", "F", { 1984: 7000 })];
  const stats = records.map((r) => summarizeRecord(r, 2017));
  const out = computeOwnership(stats, computeTop1000Years(records), 1000);
  assert.equal(out.female[0]!.name, "Mid"); // strictly higher score
  assert.equal(out.female[1]!.name, "Ann"); // tie with Zed -> alphabetical
  assert.equal(out.female[2]!.name, "Zed");
  assert.equal(out.female[1]!.ownershipRank, 2);
  // popularity ties break alphabetically too
  const ann = out.female.find((r) => r.name === "Ann")!;
  const zed = out.female.find((r) => r.name === "Zed")!;
  assert.equal(ann.popularityRank, 2);
  assert.equal(zed.popularityRank, 3);
  // repeated runs identical
  const again = computeOwnership(records.map((r) => summarizeRecord(r, 2017)), computeTop1000Years(records), 1000);
  assert.deepEqual(out, again);
});

test("names appearing for both sexes are scored independently", () => {
  const records = [
    rec("Dual", "F", { 1984: 6000 }),
    rec("Dual", "M", { 1900: 90000, 1984: 8000 }),
    rec("Otherf", "F", { 1984: 5000 }),
    rec("Otherm", "M", { 1985: 9000 }),
  ];
  const stats = records.map((r) => summarizeRecord(r, 2017));
  const out = computeOwnership(stats, computeTop1000Years(records), 1000);
  const dualF = out.female.find((r) => r.name === "Dual")!;
  const dualM = out.male.find((r) => r.name === "Dual")!;
  assert.equal(dualF.lifetimeBirths, 6000);
  assert.equal(dualM.lifetimeBirths, 98000);
  assert.notEqual(dualF.ownershipScore, dualM.ownershipScore);
});

// ---------------------------------------------------------------------------
// real-data integration (tracked shards, ssa-national-2017)
// ---------------------------------------------------------------------------

async function realProfile() {
  const { source, sourceVersion } = await loadShardSource();
  const familiesCsv = await readFile(FAMILIES_CSV_PATH, "utf8");
  return {
    source,
    profile: buildDecadeProfile({
      source,
      alpha: DECADE_HUB_ALPHA,
      familiesCsv,
      generatedAt: "2026-01-01T00:00:00.000Z",
      sourceVersion,
    }),
  };
}

test("sanity anchors hold on the real source data (SPEC §1)", async () => {
  const { source } = await loadShardSource();
  const anchors = assertSanityAnchors(source);
  assert.ok(anchors.michaelM1984 >= 60000 && anchors.michaelM1984 <= 70000);
  assert.ok(anchors.jenniferF1980s > 350000);
  assert.ok(anchors.totalBirths1984 > 3.4e6 && anchors.totalBirths1984 < 3.6e6);
});

test("real profile: era-bound names rise, classics fall, structure sound", async () => {
  const { source, profile } = await realProfile();
  assert.equal(profile.methodologyVersion, DECADE_HUB_METHODOLOGY_VERSION);
  assert.equal(profile.alpha, DECADE_HUB_ALPHA);
  assert.equal(profile.decade, 1980);
  assert.equal(profile.startYear, DECADE_START);
  assert.equal(profile.endYear, DECADE_END);
  assert.equal(profile.isComplete, true);
  assert.ok(profile.distinctNames > 30000);
  assert.ok(profile.totalBirths > 35e6);
  // per-sex priors populated
  assert.ok(profile.priorDecadeShareFemale > 0 && profile.priorDecadeShareFemale < 1);
  assert.ok(profile.priorDecadeShareMale > 0 && profile.priorDecadeShareMale < 1);

  const f = profile.ownershipRankings.female;
  const m = profile.ownershipRankings.male;
  assert.ok(f.length > 500 && m.length > 500);

  // SPEC §3 validation expectations (direction of rank movement, not winners)
  const byName = (rows: typeof f, name: string) => rows.find((r) => r.name === name)!;
  for (const eraBound of ["Tiffany", "Brittany"]) {
    const r = byName(f, eraBound);
    assert.ok(r.ownershipRank < r.popularityRank, `${eraBound} should outrank its popularity rank`);
  }
  for (const eraBound of ["Dustin", "Cory"]) {
    const r = byName(m, eraBound);
    assert.ok(r.ownershipRank < r.popularityRank, `${eraBound} should outrank its popularity rank`);
  }
  for (const classic of ["James", "William"]) {
    const r = byName(m, classic);
    assert.ok(r.ownershipRank > r.popularityRank, `${classic} should drop vs its popularity rank`);
  }
  const elizabeth = byName(f, "Elizabeth");
  assert.ok(elizabeth.ownershipRank > elizabeth.popularityRank, "Elizabeth should drop vs its popularity rank");

  // every row satisfies the SPEC §3 eligibility rule
  const top1000 = computeTop1000Years(source.records);
  for (const r of [...f, ...m]) {
    const stat = summarizeRecord(
      source.records.find((x) => x.name === r.name && x.sex === r.sex)!,
      source.maxYear,
    );
    assert.ok(isEligible(stat, top1000), `${r.name} (${r.sex}) must satisfy the eligibility rule`);
  }
  // low-volume exclusion from the flagship view at the chosen alpha
  assert.ok(profile.ownershipRankings.mostOwned.every((r) => r.birthsInDecade >= ELIGIBILITY_MIN_BIRTHS));

  // cross-sex views: sizes + ordering rules
  for (const view of ["mostOwned", "mostPopular", "popularButTimeless", "unexpected"] as const) {
    assert.ok(profile.ownershipRankings[view].length <= 25);
  }
  const mo = profile.ownershipRankings.mostOwned;
  for (let i = 1; i < mo.length; i++) assert.ok(mo[i - 1]!.ownershipScore >= mo[i]!.ownershipScore);
  const mp = profile.ownershipRankings.mostPopular;
  for (let i = 1; i < mp.length; i++) assert.ok(mp[i - 1]!.birthsInDecade >= mp[i]!.birthsInDecade);
  const un = profile.ownershipRankings.unexpected;
  for (const r of un) assert.ok(r.popularityRank - r.ownershipRank >= 20);
  for (let i = 1; i < un.length; i++) {
    assert.ok(
      un[i - 1]!.popularityRank - un[i - 1]!.ownershipRank >= un[i]!.popularityRank - un[i]!.ownershipRank,
    );
  }

  // independent recomputation of a decade/lifetime total from raw records
  const jen = source.records.find((r) => r.name === "Jennifer" && r.sex === "F")!;
  let decade = 0;
  let lifetime = 0;
  for (const [y, c] of Object.entries(jen.series)) {
    lifetime += c;
    if (Number(y) >= 1980 && Number(y) <= 1989) decade += c;
  }
  const jenRow = byName(f, "Jennifer");
  assert.equal(jenRow.birthsInDecade, decade);
  assert.equal(jenRow.lifetimeBirths, lifetime);
});

test("determinism: two full builds are byte-identical except generatedAt", async () => {
  const { source, sourceVersion } = await loadShardSource();
  const familiesCsv = await readFile(FAMILIES_CSV_PATH, "utf8");
  const input = { source, alpha: DECADE_HUB_ALPHA, familiesCsv, sourceVersion };
  const a = buildDecadeProfile({ ...input, generatedAt: "2026-01-01T00:00:00.000Z" });
  const b = buildDecadeProfile({ ...input, generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(a, b);
  assert.equal(stableStringify(a), stableStringify(b));
  // generatedAt is the ONLY permitted difference
  const c = buildDecadeProfile({ ...input, generatedAt: "2026-06-06T00:00:00.000Z" });
  const strip = (p: typeof a) => {
    const { generatedAt, ...rest } = p;
    return rest;
  };
  assert.deepEqual(strip(a), strip(c));
  assert.equal(stableStringify(strip(a)), stableStringify(strip(c)));
});
