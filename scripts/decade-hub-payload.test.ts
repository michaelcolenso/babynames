// Payload-suite tests: the REAL generated artifact (SPEC §13).
// Asserts headline numbers of data/dist/decade-hub-1980.json, the exact
// artifact the D1 migration ships. Committed alongside it:
// scripts/fixtures/decade-hub-1980.real.fixture.json (a slim, deterministic
// extract: per-sex top-100 ownership rows) so review does not require the
// multi-MB payload in git.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";

const artifact = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../data/dist/decade-hub-1980.json"), "utf8"),
) as DecadeProfile;

const realFixture = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures/decade-hub-1980.real.fixture.json"), "utf8"),
) as { femaleTop100: unknown[]; maleTop100: unknown[] };

test("real artifact headline numbers (SSA shards, ssa-national-2017)", () => {
  assert.equal(artifact.decade, 1980);
  assert.equal(artifact.isComplete, true);
  assert.equal(artifact.dataThroughYear, 2017);
  assert.equal(artifact.totalBirths, 35627408);
  assert.equal(artifact.femaleBirths, 17171969);
  assert.equal(artifact.maleBirths, 18455439);
  assert.equal(artifact.distinctNames, 38588);
  assert.equal(artifact.methodologyVersion, "decade-hub/v1.0.0");
  assert.equal(artifact.sourceVersion, "ssa-national-2017");
  assert.equal(artifact.alpha, 2500);
});

test("real artifact champions and diversity metrics", () => {
  assert.equal(artifact.femaleChampion.name, "Jessica");
  assert.equal(artifact.femaleChampion.birthsInDecade, 469472);
  assert.equal(artifact.maleChampion.name, "Michael");
  assert.equal(artifact.maleChampion.birthsInDecade, 663690);
  assert.equal(artifact.top10Share, 0.124835);
  assert.equal(artifact.top100Share, 0.499158);
  assert.equal(artifact.diversityScore, 65.2658);
  assert.equal(artifact.effectiveNames, 985.96);
  assert.equal(artifact.concentrationScore, 0.2581);
});

test("real artifact ownership leaders", () => {
  assert.equal(artifact.ownershipRankings.female[0]!.name, "Krystle");
  assert.equal(artifact.ownershipRankings.female[0]!.ownershipRank, 1);
  assert.equal(artifact.ownershipRankings.male[0]!.name, "Dustin");
  assert.equal(artifact.ownershipRankings.mostOwned.length, 25);
  assert.equal(artifact.ownershipRankings.mostOwned[0]!.name, "Krystle");
});

test("real artifact classroom: 1984, 30 seats, no duplicate names", () => {
  const c = artifact.classroomDefaults;
  assert.equal(c.year, 1984);
  assert.equal(c.size, 30);
  assert.equal(c.students.length, 30);
  assert.equal(c.femaleSeats + c.maleSeats, 30);
  assert.equal(c.uniqueNames, 30);
  assert.equal(c.repeatedNames, 0);
  assert.equal(c.mostRepeated.seats, 1);
  assert.equal(c.topShare, 1 / 30);
  // Michael is the first name in deterministic roster order (largest remainder)
  assert.equal(c.mostRepeated.name, "Michael");
});

test("real artifact spelling families: exactly the approved six, ordered by total", () => {
  assert.deepEqual(
    artifact.spellingFamilies.map((f) => f.id),
    ["ashley", "megan", "brittany", "caitlin", "kristen", "courtney"],
  );
  const ashley = artifact.spellingFamilies[0]!;
  assert.equal(ashley.totalBirthsInDecade, 387653);
  assert.equal(ashley.combinedDecadeRank, 3);
  assert.equal(ashley.dominantVariant, "Ashley");
  assert.equal(ashley.yearly.length, 10);
});

test("real fixture extract matches the artifact's per-sex top-100 ownership rows", () => {
  assert.equal(artifact.ownershipRankings.female.length >= 100, true);
  assert.equal(artifact.ownershipRankings.male.length >= 100, true);
  assert.deepEqual(artifact.ownershipRankings.female.slice(0, 100), realFixture.femaleTop100);
  assert.deepEqual(artifact.ownershipRankings.male.slice(0, 100), realFixture.maleTop100);
});

test("real fixture top-100 rows carry the exact DecadeHub OwnershipResult shape", () => {
  const requiredKeys = [
    "name",
    "slug",
    "sex",
    "birthsInDecade",
    "lifetimeBirths",
    "ownershipRank",
    "ownershipScore",
    "popularityRank",
    "rankedYearsInDecade",
    "decadeShare",
    "adjustedConcentration",
    "normalizedConcentration",
    "normalizedProminence",
    "peakYear",
    "peakCount",
    "firstYear",
    "lastYear",
    "status",
  ];
  for (const row of [...realFixture.femaleTop100, ...realFixture.maleTop100] as Record<string, unknown>[]) {
    for (const key of requiredKeys) {
      assert.ok(key in row, `missing key ${key} in row ${row.name}`);
    }
  }
  // sex separation is exact: 100 F rows and 100 M rows, no cross-contamination
  assert.ok((realFixture.femaleTop100 as { sex: string }[]).every((r) => r.sex === "F"));
  assert.ok((realFixture.maleTop100 as { sex: string }[]).every((r) => r.sex === "M"));
  // ownership ranks are a complete 1..100 sequence in each sex set
  const fRanks = (realFixture.femaleTop100 as { ownershipRank: number }[]).map((r) => r.ownershipRank).sort((a, b) => a - b);
  const mRanks = (realFixture.maleTop100 as { ownershipRank: number }[]).map((r) => r.ownershipRank).sort((a, b) => a - b);
  assert.deepEqual(fRanks, Array.from({ length: 100 }, (_, i) => i + 1));
  assert.deepEqual(mRanks, Array.from({ length: 100 }, (_, i) => i + 1));
});

test("real artifact generatedAt is present and ISO-8601", () => {
  assert.match(artifact.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});
