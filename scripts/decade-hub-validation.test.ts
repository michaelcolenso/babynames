import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateDecadeHubProfile } from "../packages/shared/src/decade-hub-validate";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";
import { getDecadeHubDefinition, type DecadeHubDefinition } from "../packages/shared/src/content/decade-hub-definitions";

const REAL = JSON.parse(readFileSync(new URL("./fixtures/decade-hub-1980.real.fixture.json", import.meta.url), "utf8")) as DecadeProfile;
const SEEDED = getDecadeHubDefinition("1980s")!;
const clone = <T>(value: T): T => structuredClone(value);
const draftDefinition = (source = SEEDED): DecadeHubDefinition => ({ ...source, thesisSourceVersion: "", rolloutState: "draft" });

function issueCodes(value: unknown, definition = SEEDED) {
  const result = validateDecadeHubProfile(value, definition);
  return result.ok ? [] : result.issues.map((issue) => `${issue.code}:${issue.path}`);
}

test("valid real 2025 artifact passes the seeded 1980s definition", () => {
  const result = validateDecadeHubProfile(REAL, SEEDED);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues, null, 2));
  if (result.ok) assert.equal(result.profile, REAL);
});

test("draft provenance accepts structurally valid sources without thesis matching", () => {
  const draft = draftDefinition({ ...SEEDED, thesisSourceVersion: "ssa-national-2017" });
  assert.equal(validateDecadeHubProfile(REAL, draft).ok, true);
  const reviewedAgainstOldThesis: DecadeHubDefinition = { ...draft, rolloutState: "seeded" };
  assert.ok(issueCodes(REAL, reviewedAgainstOldThesis).includes("thesis-source-mismatch:$.sourceVersion"));
});

test("unknown roots and missing required fields return deterministic typed issues", () => {
  assert.deepEqual(issueCodes(null), ["root-type:$"]);
  const missing = clone(REAL) as unknown as Record<string, unknown>;
  delete missing.totalBirths;
  assert.ok(issueCodes(missing).includes("missing-field:$.totalBirths"));
});

test("coverage and source identity are derived rather than trusted", () => {
  const falseCoverage = clone(REAL);
  falseCoverage.endYear = 1988;
  falseCoverage.isComplete = false;
  assert.ok(issueCodes(falseCoverage).includes("coverage-mismatch:$.endYear"));

  const hostileCoverage = clone(REAL);
  hostileCoverage.endYear = Number.MAX_SAFE_INTEGER;
  assert.doesNotThrow(() => validateDecadeHubProfile(hostileCoverage, SEEDED));
  assert.ok(issueCodes(hostileCoverage).includes("coverage-mismatch:$.endYear"));

  const negativeCoverage = clone(REAL);
  negativeCoverage.endYear = -1;
  assert.doesNotThrow(() => validateDecadeHubProfile(negativeCoverage, SEEDED));
  assert.ok(issueCodes(negativeCoverage).includes("coverage-mismatch:$.endYear"));

  const beforeDecade = clone(REAL);
  beforeDecade.dataThroughYear = 1979;
  beforeDecade.endYear = 1979;
  beforeDecade.isComplete = false;
  beforeDecade.sourceVersion = "ssa-national-1979";
  assert.ok(issueCodes(beforeDecade, draftDefinition()).includes("coverage-mismatch:$.dataThroughYear"));

  const badSource = clone(REAL);
  badSource.sourceVersion = "ssa-national-2024";
  assert.ok(issueCodes(badSource, draftDefinition()).includes("source-version-mismatch:$.sourceVersion"));
});

test("optional git commit is typed when present", () => {
  const broken = clone(REAL) as unknown as Record<string, unknown>;
  broken.gitCommit = 123;
  assert.ok(issueCodes(broken).includes("wrong-type:$.gitCommit"));
});

test("top-level birth totals and bounded metrics reconcile", () => {
  const broken = clone(REAL);
  broken.totalBirths += 1;
  broken.top10Share = 1.1;
  broken.effectiveNames = broken.distinctNames + 1;
  const codes = issueCodes(broken);
  assert.ok(codes.includes("reconciliation-failed:$.totalBirths"));
  assert.ok(codes.includes("invalid-value:$.top10Share"));
  assert.ok(codes.includes("invalid-value:$.effectiveNames"));
});

test("champions have the required sex and reconciling birth counts", () => {
  const broken = clone(REAL);
  broken.femaleChampion.sex = "M";
  broken.maleChampion.lifetimeBirths = broken.maleChampion.birthsInDecade - 1;
  const codes = issueCodes(broken);
  assert.ok(codes.includes("invalid-value:$.femaleChampion.sex"));
  assert.ok(codes.includes("reconciliation-failed:$.maleChampion.lifetimeBirths"));
});

test("nested required scalars are validated before returning a trusted profile", () => {
  const broken = clone(REAL) as unknown as Record<string, any>;
  broken.ownershipRankings.female[0].rankedYearsInDecade = "10";
  delete broken.ownershipRankings.male[0].status;
  broken.ownershipRankings.mostOwned[0].peakYear = Infinity;
  broken.ownershipRankings.mostOwned[1].firstYear = 1;
  broken.ownershipRankings.mostOwned[1].lastYear = 1;
  broken.ownershipRankings.mostOwned[1].peakCount = 0;
  broken.classroomDefaults.repeatedNames = 0.5;
  broken.spellingFamilies[0].combinedDecadeRank = 0;
  broken.spellingFamilies[0].variants[0].decadeRank = -1;
  broken.spellingFamilies[0].rationale = "";
  const codes = issueCodes(broken);
  assert.ok(codes.includes("wrong-type:$.ownershipRankings.female[0].rankedYearsInDecade"));
  assert.ok(codes.includes("missing-field:$.ownershipRankings.male[0].status"));
  assert.ok(codes.includes("non-finite-number:$.ownershipRankings.mostOwned[0].peakYear"));
  assert.ok(codes.includes("invalid-value:$.ownershipRankings.mostOwned[1].firstYear"));
  assert.ok(codes.includes("invalid-value:$.ownershipRankings.mostOwned[1].lastYear"));
  assert.ok(codes.includes("invalid-value:$.ownershipRankings.mostOwned[1].peakCount"));
  assert.ok(codes.includes("classroom-invalid:$.classroomDefaults.repeatedNames"));
  assert.ok(codes.includes("family-invalid:$.spellingFamilies[0].combinedDecadeRank"));
  assert.ok(codes.includes("family-invalid:$.spellingFamilies[0].variants[0].decadeRank"));
  assert.ok(codes.includes("family-invalid:$.spellingFamilies[0].rationale"));
});

test("ranking views reject wrong sex, duplicate identities, duplicate ranks, and disorder", () => {
  const broken = clone(REAL);
  broken.ownershipRankings.female[0]!.sex = "M";
  broken.ownershipRankings.female[1] = clone(broken.ownershipRankings.female[0]!);
  broken.ownershipRankings.male[1]!.ownershipRank = broken.ownershipRankings.male[0]!.ownershipRank;
  broken.ownershipRankings.mostPopular = [...broken.ownershipRankings.mostPopular].reverse();
  const codes = issueCodes(broken);
  assert.ok(codes.includes("invalid-value:$.ownershipRankings.female[0].sex"));
  assert.ok(codes.includes("duplicate-identity:$.ownershipRankings.female[1]"));
  assert.ok(codes.includes("rank-invalid:$.ownershipRankings.male[1].ownershipRank"));
  assert.ok(codes.some((code) => code.startsWith("order-invalid:$.ownershipRankings.mostPopular")));
});

test("ranking prefixes may be truncated but pooled views cannot exceed 25 rows", () => {
  const truncated = clone(REAL);
  truncated.ownershipRankings.female = truncated.ownershipRankings.female.slice(0, 2);
  truncated.ownershipRankings.male = truncated.ownershipRankings.male.slice(0, 2);
  assert.equal(validateDecadeHubProfile(truncated, SEEDED).ok, true);

  const oversized = clone(REAL);
  oversized.ownershipRankings.mostOwned = Array.from({ length: 26 }, (_, index) => ({
    ...clone(REAL.ownershipRankings.mostOwned[0]!),
    name: `Name${index}`,
    slug: `Name${index}`,
    ownershipRank: index + 1,
    popularityRank: index + 1,
  }));
  assert.ok(issueCodes(oversized).includes("invalid-value:$.ownershipRankings.mostOwned"));
});

test("classroom expanded and compact rosters reconcile to exactly 30 seats", () => {
  assert.equal(validateDecadeHubProfile(REAL, SEEDED).ok, true);
  const compact = clone(REAL);
  const roster = compact.classroomDefaults.students;
  const firstIndex = 0;
  const secondIndex = roster.findIndex((student, index) => index > 0 && student.sex === roster[firstIndex]!.sex);
  roster[firstIndex]!.seats = 2;
  roster.splice(secondIndex, 1);
  compact.classroomDefaults.uniqueNames = 29;
  compact.classroomDefaults.repeatedNames = 1;
  compact.classroomDefaults.mostRepeated = { name: roster[firstIndex]!.name, slug: roster[firstIndex]!.slug, seats: 2 };
  compact.classroomDefaults.topShare = 0.0667;
  assert.equal(validateDecadeHubProfile(compact, SEEDED).ok, true);

  compact.classroomDefaults.students[0]!.seats = 1;
  assert.ok(issueCodes(compact).includes("classroom-invalid:$.classroomDefaults.students"));
});

test("classroom rejects broken counts, identity, maxima, and top share", () => {
  const broken = clone(REAL);
  broken.classroomDefaults.femaleSeats -= 1;
  broken.classroomDefaults.uniqueNames -= 1;
  broken.classroomDefaults.mostRepeated.name = "Missing";
  broken.classroomDefaults.topShare = 0.5;
  const codes = issueCodes(broken);
  assert.ok(codes.includes("classroom-invalid:$.classroomDefaults.femaleSeats"));
  assert.ok(codes.includes("classroom-invalid:$.classroomDefaults.uniqueNames"));
  assert.ok(codes.includes("classroom-invalid:$.classroomDefaults.mostRepeated"));
  assert.ok(codes.includes("classroom-invalid:$.classroomDefaults.topShare"));
});

test("spelling families reject duplicate identities and inconsistent totals", () => {
  const broken = clone(REAL);
  broken.spellingFamilies.push(clone(broken.spellingFamilies[0]!));
  broken.spellingFamilies[0]!.variants[1]!.name = broken.spellingFamilies[0]!.variants[0]!.name;
  broken.spellingFamilies[0]!.totalBirthsInDecade += 1;
  const codes = issueCodes(broken);
  assert.ok(codes.some((code) => code.startsWith("duplicate-identity:$.spellingFamilies")));
  assert.ok(codes.includes("family-invalid:$.spellingFamilies[0].totalBirthsInDecade"));
});

test("spelling family yearly points exactly cover the profile and reconcile peak year", () => {
  const broken = clone(REAL);
  broken.spellingFamilies[0]!.yearly.splice(2, 1);
  broken.spellingFamilies[1]!.yearly[0]!.total += 1;
  broken.spellingFamilies[2]!.peakYear = broken.startYear;
  const codes = issueCodes(broken);
  assert.ok(codes.includes("family-invalid:$.spellingFamilies[0].yearly"));
  assert.ok(codes.includes("family-invalid:$.spellingFamilies[1].yearly[0].total"));
  assert.ok(codes.includes("family-invalid:$.spellingFamilies[2].peakYear"));
});

test("empty spelling-family evidence is structurally valid", () => {
  const empty = clone(REAL);
  empty.spellingFamilies = [];
  assert.equal(validateDecadeHubProfile(empty, SEEDED).ok, true);
});

test("partial 2020s profiles require exactly the covered family years", () => {
  const partial = clone(REAL);
  const definition = draftDefinition({ ...SEEDED, slug: "2020s", startYear: 2020, nominalEndYear: 2029, classroomYear: 2024 });
  partial.decade = 2020;
  partial.startYear = 2020;
  partial.endYear = 2025;
  partial.nominalEndYear = 2029;
  partial.dataThroughYear = 2025;
  partial.isComplete = false;
  partial.classroomDefaults.year = 2024;
  for (const view of Object.values(partial.ownershipRankings)) for (const row of view) row.rankedYearsInDecade = Math.min(row.rankedYearsInDecade, 6);
  partial.spellingFamilies = [];
  assert.equal(validateDecadeHubProfile(partial, definition).ok, true);

  partial.spellingFamilies = clone(REAL.spellingFamilies.slice(0, 1));
  assert.ok(issueCodes(partial, definition).includes("family-invalid:$.spellingFamilies[0].yearly"));
});
