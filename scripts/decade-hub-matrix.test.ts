import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecadeProfileGeneric,
  compareLexicalNames,
  computeDecadeCoverage,
  createDecadeComputeConfig,
  DEFAULT_DECADE_HUB_ALPHA,
  evaluateSanityAnchors,
  summarizeRecordGeneric,
} from "../packages/shared/src/decade-hub-compute-core";
import { buildDecadeProfile as build1980Profile } from "../packages/shared/src/decade-hub-compute";
import { buildDecadeProfile as build1920Profile } from "../packages/shared/src/decade-hub-compute-1920";
import type { DecadeHubSource, SourceNameRecord } from "../packages/shared/src/decade-hub-compute";
import { DECADE_HUB_DEFINITIONS } from "../packages/shared/src/content/decade-hub-definitions";
import { loadShardSource } from "./build-decade-hub";

const EMPTY_FAMILIES = "family_id,label,canonical,variant,review_status,rationale\n";

function rec(name: string, sex: "F" | "M", series: Record<number, number>): SourceNameRecord {
  return { name, sex, series };
}

function configFor(startYear: number, classroomYear = startYear + 4) {
  const definition = DECADE_HUB_DEFINITIONS.find((candidate) => candidate.startYear === startYear)!;
  return createDecadeComputeConfig({ ...definition, classroomYear });
}

function normalizeGeneratedAt<T extends { generatedAt: string }>(profile: T) {
  const { generatedAt: _generatedAt, ...rest } = profile;
  return rest;
}

test("generic summarization uses configured non-1980 decade", () => {
  const config = configFor(1990);
  const stats = summarizeRecordGeneric(rec("Nineties", "F", { 1989: 99, 1990: 100, 1999: 200, 2000: 300 }), 2000, config);
  assert.equal(stats.birthsInDecade, 300);
  assert.deepEqual(stats.yearlyInDecade, { 1990: 100, 1999: 200 });
});

test("partial 2020 coverage reports actual end and six family years", () => {
  const config = configFor(2020, 2024);
  const source: DecadeHubSource = {
    minYear: 2020,
    maxYear: 2025,
    records: [
      rec("Ava", "F", { 2020: 10000, 2021: 10000, 2022: 10000, 2023: 10000, 2024: 10000, 2025: 10000 }),
      rec("Adam", "M", { 2020: 10000, 2021: 10000, 2022: 10000, 2023: 10000, 2024: 10000, 2025: 10000 }),
      rec("Eve", "F", { 2020: 1000, 2021: 1000, 2022: 1000, 2023: 1000, 2024: 1000, 2025: 1000 }),
      rec("Evan", "M", { 2020: 1000, 2021: 1000, 2022: 1000, 2023: 1000, 2024: 1000, 2025: 1000 }),
    ],
  };
  const familyCsv =
    "family_id,label,canonical,variant,review_status,rationale\n" +
    "ava-family,Ava family,Ava,Ava,approved,fixture\n" +
    "ava-family,Ava family,Ava,Avaa,approved,fixture\n";
  source.records.push(rec("Avaa", "F", { 2020: 1000, 2021: 1000, 2022: 1000, 2023: 1000, 2024: 1000, 2025: 1000 }));
  const profile = buildDecadeProfileGeneric({
    source,
    config,
    familiesCsv: familyCsv,
    generatedAt: "2026-01-01T00:00:00.000Z",
    sourceVersion: "fixture",
  });
  assert.equal(computeDecadeCoverage(source, config).endYear, 2025);
  assert.equal(profile.endYear, 2025);
  assert.equal(profile.nominalEndYear, 2029);
  assert.equal(profile.isComplete, false);
  assert.equal(profile.spellingFamilies.length, 1);
  assert.deepEqual(profile.spellingFamilies[0]!.yearly.map((point) => point.year), [2020, 2021, 2022, 2023, 2024, 2025]);
});

test("classroom year outside partial actual coverage fails clearly", () => {
  const config = configFor(2020, 2028);
  const source: DecadeHubSource = {
    minYear: 2020,
    maxYear: 2025,
    records: [rec("Ava", "F", { 2020: 10000 }), rec("Adam", "M", { 2020: 10000 })],
  };
  assert.throws(
    () => buildDecadeProfileGeneric({ source, config, familiesCsv: EMPTY_FAMILIES, generatedAt: "x", sourceVersion: "fixture" }),
    /classroom year 2028.*coverage 2020–2025/i,
  );
});

test("coverage rejects sources that begin after the configured decade start", () => {
  const config = configFor(2020, 2024);
  const source: DecadeHubSource = { minYear: 2023, maxYear: 2029, records: [] };
  assert.throws(() => computeDecadeCoverage(source, config), /source min year 2023 is after decade start 2020/i);
});

test("record-year sanity anchors must fall within actual coverage", () => {
  const config = createDecadeComputeConfig({
    startYear: 2020,
    nominalEndYear: 2029,
    classroomYear: 2024,
    sanityAnchors: [{ kind: "record-year-count", name: "Ava", sex: "F", year: 2028, min: 0, max: 10 }],
  });
  const source: DecadeHubSource = { minYear: 2020, maxYear: 2025, records: [rec("Ava", "F", { 2025: 5 })] };
  assert.throws(() => evaluateSanityAnchors(source, config), /sanity anchor year 2028 is outside actual coverage 2020–2025/i);
});

test("profile construction fails explicitly when either sex has no eligible names", () => {
  const config = configFor(2020, 2024);
  const source: DecadeHubSource = { minYear: 2020, maxYear: 2025, records: [rec("Ava", "F", { 2020: 10_000, 2024: 10_000 })] };
  assert.throws(
    () => buildDecadeProfileGeneric({ source, config, familiesCsv: EMPTY_FAMILIES, generatedAt: "x", sourceVersion: "fixture" }),
    /no eligible male names/i,
  );
});

test("lexical ties match the pre-refactor lowercase code-point comparator", () => {
  assert.ok(compareLexicalNames("Z", "Å") < 0);
  assert.ok(compareLexicalNames("Å", "Z") > 0);
  assert.equal(compareLexicalNames("Ada", "ada"), 0);
});

test("compatibility wrappers share the core alpha default", () => {
  assert.equal(DEFAULT_DECADE_HUB_ALPHA, 2500);
  assert.equal(configFor(1980).alpha, DEFAULT_DECADE_HUB_ALPHA);
  assert.equal(configFor(1920).alpha, DEFAULT_DECADE_HUB_ALPHA);
});

test("complete generic 1920s and 1980s builds match compatibility wrappers", async () => {
  const { source: source1980, sourceVersion } = await loadShardSource();
  const familiesCsv = "family_id,label,canonical,variant,review_status,rationale\n";
  const generic1980 = buildDecadeProfileGeneric({
    source: source1980,
    config: configFor(1980),
    familiesCsv,
    generatedAt: "2026-01-01T00:00:00.000Z",
    sourceVersion,
  });
  const wrapped1980 = build1980Profile({ source: source1980, alpha: 2500, familiesCsv, generatedAt: "2026-01-01T00:00:00.000Z", sourceVersion });
  assert.deepEqual(normalizeGeneratedAt(generic1980), normalizeGeneratedAt(wrapped1980));

  const source1920: DecadeHubSource = { ...source1980, minYear: 1920, maxYear: 1929 };
  const generic1920 = buildDecadeProfileGeneric({ source: source1920, config: configFor(1920), familiesCsv, generatedAt: "2026-01-01T00:00:00.000Z", sourceVersion });
  const wrapped1920 = build1920Profile({ source: source1920, alpha: 2500, familiesCsv, generatedAt: "2026-01-01T00:00:00.000Z", sourceVersion });
  assert.deepEqual(normalizeGeneratedAt(generic1920), normalizeGeneratedAt(wrapped1920));
});

test("generic matrix invariants hold for complete pilot builds", async () => {
  const { source, sourceVersion } = await loadShardSource();
  const familiesCsv = EMPTY_FAMILIES;
  for (const startYear of [1920, 1980]) {
    const decadeSource = { ...source, minYear: startYear, maxYear: startYear + 9 };
    const profile = buildDecadeProfileGeneric({ source: decadeSource, config: configFor(startYear), familiesCsv, generatedAt: "x", sourceVersion });
    assert.equal(profile.totalBirths, profile.femaleBirths + profile.maleBirths);
    assert.equal(profile.classroomDefaults.students.length, 30);
    assert.equal(profile.classroomDefaults.femaleSeats + profile.classroomDefaults.maleSeats, 30);
    assert.equal(profile.femaleChampion.sex, "F");
    assert.equal(profile.maleChampion.sex, "M");
    for (const rows of [profile.ownershipRankings.female, profile.ownershipRankings.male]) {
      assert.ok(rows.every((row) => row.ownershipRank >= 1 && row.ownershipRank <= rows.length && row.popularityRank >= 1 && row.popularityRank <= rows.length));
      assert.ok(rows.every((row) => row.ownershipScore >= 0 && row.ownershipScore <= 100));
    }
    const again = buildDecadeProfileGeneric({ source: decadeSource, config: configFor(startYear), familiesCsv, generatedAt: "x", sourceVersion });
    assert.deepEqual(profile, again);
  }
});
