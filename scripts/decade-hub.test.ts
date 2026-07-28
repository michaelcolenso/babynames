// Ownership-suite tests for the 1980s decade hub compute layer (SPEC §13).
// Deterministic synthetic source data — no real SSA rows needed.

import assert from "node:assert/strict";
import test from "node:test";

import {
  DECADE_HUB_ALPHA,
  buildDecadeProfile,
  computeOwnership,
  computeTop1000Years,
  stableStringify,
  summarizeRecord,
} from "../packages/shared/src/decade-hub-compute";
import type { DecadeHubSource, SourceNameRecord } from "../packages/shared/src/decade-hub-compute";

function series(entries: [number, number][]): Record<number, number> {
  return Object.fromEntries(entries);
}

const EMPTY_CSV = "family_id,label,canonical,variant,review_status,rationale\n";

/** Names listed most-concentrated-first for the F set. */
function fixtureSource(): DecadeHubSource {
  const records: SourceNameRecord[] = [];
  // Ten female names with strictly decreasing 1980s concentration and strictly
  // increasing lifetime volume, so min-max normalization spans 0..1.
  for (let i = 0; i < 10; i++) {
    const perYear80s = 1000 - i * 50; // decade births shrink down the list
    const tailYears: [number, number][] = [];
    for (let y = 1990; y < 1990 + i * 3; y++) tailYears.push([y, 500]); // longer tails down the list
    records.push({
      name: `Girl${i}`,
      sex: "F",
      series: series([
        [1979, 100],
        ...([1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989].map((y) => [y, perYear80s] as [number, number])),
        ...tailYears,
        [2017, 100 + i * 10],
      ]),
    });
  }
  // Ten male names, same shape, different magnitudes.
  for (let i = 0; i < 10; i++) {
    const perYear80s = 2000 - i * 100;
    const tailYears: [number, number][] = [];
    for (let y = 1990; y < 1990 + i * 3; y++) tailYears.push([y, 700]);
    records.push({
      name: `Boy${i}`,
      sex: "M",
      series: series([
        [1979, 100],
        ...([1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989].map((y) => [y, perYear80s] as [number, number])),
        ...tailYears,
        [2017, 100 + i * 10],
      ]),
    });
  }
  // Cross-sex name: recorded for BOTH sexes with very different profiles.
  records.push({
    name: "Shared",
    sex: "F",
    series: series([[1985, 900], [1986, 900]]), // 1,800 decade births — ineligible on F
  });
  records.push({
    name: "Shared",
    sex: "M",
    series: series([
      [1980, 600], [1981, 600], [1982, 600], [1983, 600], [1984, 600],
      [1985, 600], [1986, 600], [1987, 600], [1988, 600], [1989, 600],
    ]), // 6,000 decade births — eligible on M
  });
  // Below-threshold name: present but not eligible anywhere.
  records.push({ name: "Tiny", sex: "F", series: series([[1984, 42]]) });
  return { minYear: 1880, maxYear: 2017, records };
}

function computed() {
  const source = fixtureSource();
  const stats = source.records.map((r) => summarizeRecord(r, source.maxYear));
  const top1000 = computeTop1000Years(source.records);
  return computeOwnership(stats, top1000, DECADE_HUB_ALPHA);
}

test("female and male eligible sets are scored as separate comparison sets", () => {
  const { female, male } = computed();
  assert.equal(female.length, 10);
  assert.equal(male.length, 11); // 10 Boy* + Shared (M)
  assert.ok(female.every((r) => r.sex === "F"));
  assert.ok(male.every((r) => r.sex === "M"));
  // min-max normalization is per sex: each set has its own 0 and 1 anchors.
  assert.equal(Math.max(...female.map((r) => r.normalizedConcentration)), 1);
  assert.equal(Math.min(...female.map((r) => r.normalizedConcentration)), 0);
  assert.equal(Math.max(...male.map((r) => r.normalizedConcentration)), 1);
  assert.equal(Math.min(...male.map((r) => r.normalizedConcentration)), 0);
});

test("cross-sex name is scored independently per sex, not merged", () => {
  const { female, male } = computed();
  assert.ok(!female.some((r) => r.name === "Shared"), "Shared F is below the eligibility floor");
  const sharedM = male.find((r) => r.name === "Shared");
  assert.ok(sharedM, "Shared M is eligible and ranked in the male set");
  assert.equal(sharedM.birthsInDecade, 6000);
  assert.equal(sharedM.lifetimeBirths, 6000);
});

test("shrinkage pulls low-volume names toward the prior", () => {
  const { male } = computed();
  const sharedM = male.find((r) => r.name === "Shared")!;
  // raw concentration is 1.0 (all 6,000 lifetime births in the decade); the
  // adjusted value must sit strictly below 1, pulled toward the male prior.
  assert.equal(sharedM.decadeShare, 1);
  assert.ok(sharedM.adjustedConcentration < 1, `adjusted ${sharedM.adjustedConcentration} should shrink below 1`);
  const { priorDecadeShareMale } = computed();
  assert.ok(sharedM.adjustedConcentration > priorDecadeShareMale, "but stays above the prior");
});

test("eligibility rule: >=5000 decade births OR top-1000 in >=5 distinct years", () => {
  const { female } = computed();
  assert.ok(!female.some((r) => r.name === "Tiny"));
  // Tiny has 42 births in one year only — both prongs fail.
  const source = fixtureSource();
  const top1000 = computeTop1000Years(source.records);
  assert.equal(top1000.get("F|tiny"), 1);
});

test("tie-breaks are deterministic: birthsInDecade desc, then name_lower", () => {
  const records: SourceNameRecord[] = ["TiedA", "TiedB", "TiedC"].map((name) => ({
    name,
    sex: "F" as const,
    series: series([[1980, 1000], [1981, 1000], [1982, 1000], [1983, 1000], [1984, 1000]]),
  }));
  const source: DecadeHubSource = { minYear: 1880, maxYear: 2017, records };
  const stats = source.records.map((r) => summarizeRecord(r, source.maxYear));
  const top1000 = computeTop1000Years(source.records);
  const first = computeOwnership(stats, top1000, DECADE_HUB_ALPHA);
  // reverse input order — ranks must be identical
  const reversed: DecadeHubSource = { ...source, records: [...records].reverse() };
  const stats2 = reversed.records.map((r) => summarizeRecord(r, reversed.maxYear));
  const second = computeOwnership(stats2, computeTop1000Years(reversed.records), DECADE_HUB_ALPHA);
  assert.deepEqual(
    first.female.map((r) => [r.name, r.ownershipRank, r.popularityRank]),
    second.female.map((r) => [r.name, r.ownershipRank, r.popularityRank]),
  );
  assert.deepEqual(
    first.female.map((r) => r.name),
    ["TiedA", "TiedB", "TiedC"],
    "fully tied rows order alphabetically",
  );
});

test("popularity rank and ownership rank are independent orderings", () => {
  const { female } = computed();
  // Girl0 is the most concentrated AND the biggest, but deeper rows diverge:
  // the fixture's concentration order is the reverse of its volume order.
  const byOwnership = female.map((r) => r.name);
  const byPopularity = [...female].sort((a, b) => a.popularityRank - b.popularityRank).map((r) => r.name);
  assert.deepEqual(byOwnership.slice(0, 3), ["Girl0", "Girl1", "Girl2"]);
  assert.deepEqual(byPopularity.slice(0, 3), ["Girl0", "Girl1", "Girl2"], "fixture keeps volume aligned here");
  // but concentration (normalized) falls monotonically down the list while
  // prominence rises — the two signals are not identical orderings.
  const conc = female.map((r) => r.normalizedConcentration);
  const prom = female.map((r) => r.normalizedProminence);
  assert.ok(conc[0]! > conc[9]!);
  assert.ok(prom[9]! > prom[0]!);
});

test("full profile assembly is byte-deterministic (stable key ordering)", () => {
  const source = fixtureSource();
  const input = {
    source,
    alpha: DECADE_HUB_ALPHA,
    familiesCsv: EMPTY_CSV,
    generatedAt: "2026-01-01T00:00:00.000Z",
    sourceVersion: "test-fixture",
  };
  const a = stableStringify(buildDecadeProfile(input));
  const b = stableStringify(buildDecadeProfile(input));
  assert.equal(a, b);
  // keys sorted at every level
  const parsed = JSON.parse(a) as Record<string, unknown>;
  const keys = Object.keys(parsed);
  assert.deepEqual(keys, [...keys].sort());
});

test("per-sex priors are reported alongside the pooled prior", () => {
  const { priorDecadeShareFemale, priorDecadeShareMale, priorDecadeSharePooled } = computed();
  assert.ok(priorDecadeShareFemale > 0 && priorDecadeShareFemale < 1);
  assert.ok(priorDecadeShareMale > 0 && priorDecadeShareMale < 1);
  // pooled prior is the births-weighted blend of the two sex priors
  assert.ok(
    priorDecadeSharePooled >= Math.min(priorDecadeShareFemale, priorDecadeShareMale) &&
      priorDecadeSharePooled <= Math.max(priorDecadeShareFemale, priorDecadeShareMale),
  );
});
