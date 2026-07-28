// Payload contract test for the REAL generated 1980s decade-hub artifact
// (Stage 4, orchestrator-owned). Validates
// scripts/fixtures/decade-hub-1980.real.fixture.json against the
// DecadeProfile contract (SPEC §2). Pure JSON assertions; no D1 required.
//
// The fixture is a TRIMMED copy of the real generated artifact
// (data/dist/decade-hub-1980.json): ownershipRankings.female and
// ownershipRankings.male hold the TOP 100 rows per sex (order preserved) to
// keep repo weight down; everything else — scalars, champions, alpha, priors,
// classroomDefaults, spellingFamilies, and the four pooled views — is intact.
// The full artifact regenerates via `npm run build-decade-hub`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";

const PROFILE = JSON.parse(
  readFileSync(new URL("./fixtures/decade-hub-1980.real.fixture.json", import.meta.url), "utf8"),
) as DecadeProfile;

test("required top-level fields are present with correct fixed values", () => {
  assert.equal(PROFILE.decade, 1980);
  assert.equal(PROFILE.startYear, 1980);
  assert.equal(PROFILE.endYear, 1989);
  assert.equal(PROFILE.isComplete, true);
  assert.equal(typeof PROFILE.dataThroughYear, "number");
  assert.ok(PROFILE.dataThroughYear >= PROFILE.endYear);
  for (const key of [
    "totalBirths",
    "femaleBirths",
    "maleBirths",
    "distinctNames",
    "top10Share",
    "top100Share",
    "diversityScore",
    "effectiveNames",
    "concentrationScore",
    "femaleChampion",
    "maleChampion",
    "ownershipRankings",
    "alpha",
    "priorDecadeShare",
    "classroomDefaults",
    "spellingFamilies",
    "methodologyVersion",
    "generatedAt",
    "sourceVersion",
  ] as const) {
    assert.ok(PROFILE[key] !== undefined && PROFILE[key] !== null, `missing field: ${key}`);
  }
});

test("methodology version and alpha are the shipped values", () => {
  assert.equal(PROFILE.methodologyVersion, "decade-hub/v1.0.0");
  assert.equal(PROFILE.alpha, 2500);
});

test("birth totals are positive and reconcile by sex", () => {
  assert.ok(PROFILE.totalBirths > 0);
  assert.ok(PROFILE.femaleBirths > 0);
  assert.ok(PROFILE.maleBirths > 0);
  assert.equal(PROFILE.totalBirths, PROFILE.femaleBirths + PROFILE.maleBirths);
  assert.ok(PROFILE.distinctNames > 0);
});

test("scores are within 0–100 and shares within 0–1", () => {
  for (const key of ["diversityScore", "concentrationScore"] as const) {
    assert.ok(PROFILE[key] >= 0 && PROFILE[key] <= 100, `${key} out of range: ${PROFILE[key]}`);
  }
  for (const key of ["top10Share", "top100Share", "priorDecadeShare"] as const) {
    assert.ok(PROFILE[key] >= 0 && PROFILE[key] <= 1, `${key} out of range: ${PROFILE[key]}`);
  }
  assert.ok(PROFILE.top10Share <= PROFILE.top100Share);
  assert.ok(PROFILE.effectiveNames > 0);
  assert.ok(PROFILE.effectiveNames <= PROFILE.distinctNames);
});

test("champions are well-formed name summaries", () => {
  for (const [champion, sex] of [
    [PROFILE.femaleChampion, "F"],
    [PROFILE.maleChampion, "M"],
  ] as const) {
    assert.equal(champion.sex, sex);
    assert.ok(champion.name.length > 0);
    assert.ok(champion.slug.length > 0);
    assert.ok(champion.birthsInDecade > 0);
    assert.ok(champion.lifetimeBirths >= champion.birthsInDecade);
  }
});

test("ownership rankings are sorted descending per sex and bounded in the pooled views", () => {
  const { female, male, mostOwned, mostPopular } = PROFILE.ownershipRankings;
  // Trimmed fixture: exactly the top 100 rows per sex of the real artifact.
  assert.equal(female.length, 100);
  assert.equal(male.length, 100);
  assert.ok(female.every((r) => r.sex === "F"));
  assert.ok(male.every((r) => r.sex === "M"));
  // Top entries of the real artifact: Krystle (F) and Dustin (M), rank 1.
  assert.equal(female[0].name, "Krystle");
  assert.equal(female[0].ownershipRank, 1);
  assert.equal(male[0].name, "Dustin");
  assert.equal(male[0].ownershipRank, 1);
  for (let i = 1; i < female.length; i++) {
    assert.ok(
      female[i - 1].ownershipScore >= female[i].ownershipScore,
      `female ownership not sorted at index ${i}`,
    );
  }
  for (let i = 1; i < male.length; i++) {
    assert.ok(
      male[i - 1].ownershipScore >= male[i].ownershipScore,
      `male ownership not sorted at index ${i}`,
    );
  }
  assert.ok(mostOwned.length > 0 && mostOwned.length <= 25);
  assert.ok(mostPopular.length > 0 && mostPopular.length <= 25);
  for (const row of [...female, ...male]) {
    assert.ok(row.ownershipScore >= 0 && row.ownershipScore <= 100, `score out of range: ${row.name}`);
    assert.ok(row.birthsInDecade > 0);
    assert.ok(row.lifetimeBirths >= row.birthsInDecade);
  }
});

test("classroom is a 1984 roster of exactly 30 students with reconciling seats", () => {
  const classroom = PROFILE.classroomDefaults;
  assert.equal(classroom.year, 1984);
  assert.equal(classroom.size, 30);
  // The roster is expanded one entry per seat: a repeated name appears once
  // per seat it holds, and each entry's `seats` field is that name's TOTAL
  // seat count. Summing s.seats over the roster would therefore count a
  // repeated name's seats once per appearance (Σseats²). Aggregate by unique
  // name instead so each name's total is counted exactly once.
  const seatsByName = new Map<string, number>();
  for (const s of classroom.students) {
    assert.ok(s.seats >= 1, `${s.name} has seats < 1`);
    seatsByName.set(s.name, s.seats);
  }
  assert.equal(classroom.students.length, 30, "roster must list 30 seat entries");
  assert.equal(
    [...seatsByName.values()].reduce((sum, seats) => sum + seats, 0),
    30,
    "seats aggregated by unique name must total 30",
  );
  assert.equal(classroom.femaleSeats + classroom.maleSeats, 30);
  assert.ok(classroom.femaleSeats > 0 && classroom.maleSeats > 0);
  assert.equal(classroom.uniqueNames + classroom.repeatedNames, 30);
  assert.ok(classroom.topShare > 0 && classroom.topShare <= 1);
});

test("spelling families: at least 4, ten yearly points each, totals equal variant sums", () => {
  const families = PROFILE.spellingFamilies;
  assert.ok(families.length >= 4, `expected >= 4 families, got ${families.length}`);
  for (const family of families) {
    assert.ok(family.id.length > 0 && family.label.length > 0);
    assert.equal(family.reviewStatus, "approved");
    assert.ok(family.variants.length >= 2, `family ${family.id} has < 2 variants`);
    assert.equal(
      family.totalBirthsInDecade,
      family.variants.reduce((sum, v) => sum + v.birthsInDecade, 0),
      `family ${family.id} total does not equal sum of variant birthsInDecade`,
    );
    assert.equal(family.yearly.length, 10, `family ${family.id} must have 10 yearly points`);
    assert.deepEqual(
      family.yearly.map((p) => p.year),
      [1980, 1981, 1982, 1983, 1984, 1985, 1986, 1987, 1988, 1989],
      `family ${family.id} yearly points must cover 1980–1989`,
    );
    for (const point of family.yearly) {
      assert.ok(point.total >= 0);
    }
    assert.ok(family.peakYear >= 1980 && family.peakYear <= 1989);
    assert.ok(family.combinedDecadeRank >= 1);
  }
});
