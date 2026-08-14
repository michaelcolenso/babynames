import type { SanityAnchor } from "../decade-hub-types";

export type DecadeHubRolloutState = "draft" | "reviewed" | "seeded";

export interface DecadeHubDefinition {
  readonly slug: `${number}s`;
  readonly startYear: number;
  readonly nominalEndYear: number;
  readonly classroomYear: number;
  readonly thesisSourceVersion: string;
  readonly sanityAnchors: readonly SanityAnchor[];
  readonly familyFile: string;
  readonly rolloutState: DecadeHubRolloutState;
}

const pilot1920Anchors = [
  { kind: "year-total", year: 1924, min: 1_500_000, max: 3_500_000 },
  { kind: "minimum-decade-total", min: 15_000_000 },
] as const satisfies readonly SanityAnchor[];

const pilot1980Anchors = [
  { kind: "year-total", year: 1984, min: 3_385_300, max: 3_594_700 },
  { kind: "record-year-count", name: "Michael", sex: "M", year: 1984, min: 60_000, max: 70_000 },
  { kind: "record-decade-count", name: "Jennifer", sex: "F", min: 350_001 },
] as const satisfies readonly SanityAnchor[];

interface ReviewedEvidence {
  readonly yearMin: number;
  readonly yearMax: number;
  readonly champion: string;
  readonly sex: "F" | "M";
  readonly championMin: number;
  readonly championMax: number;
}

const reviewed = (startYear: number, evidence: ReviewedEvidence): DecadeHubDefinition => ({
  slug: `${startYear}s`,
  startYear,
  nominalEndYear: startYear + 9,
  classroomYear: startYear + 4,
  thesisSourceVersion: "ssa-national-2025",
  sanityAnchors: [
    { kind: "year-total", year: startYear + 4, min: evidence.yearMin, max: evidence.yearMax },
    { kind: "record-decade-count", name: evidence.champion, sex: evidence.sex, min: evidence.championMin, max: evidence.championMax },
  ],
  familyFile: `data/manual/spelling-families-${startYear}.csv`,
  rolloutState: "reviewed",
});

/** The only checked-in list of decade hubs, in chronological order. */
export const DECADE_HUB_DEFINITIONS = [
  reviewed(1880, { yearMin: 240_000, yearMax: 247_000, champion: "Mary", sex: "F", championMin: 87_000, championMax: 97_000 }),
  reviewed(1890, { yearMin: 334_000, yearMax: 343_000, champion: "Mary", sex: "F", championMin: 124_000, championMax: 138_000 }),
  reviewed(1900, { yearMin: 398_000, yearMax: 409_000, champion: "Mary", sex: "F", championMin: 153_000, championMax: 170_000 }),
  reviewed(1910, { yearMin: 1_395_000, yearMax: 1_438_000, champion: "Mary", sex: "F", championMin: 454_000, championMax: 503_000 }),
  {
    slug: "1920s",
    startYear: 1920,
    nominalEndYear: 1929,
    classroomYear: 1924,
    thesisSourceVersion: "ssa-national-2025",
    sanityAnchors: pilot1920Anchors,
    familyFile: "data/manual/spelling-families-1920.csv",
    rolloutState: "seeded",
  },
  reviewed(1930, { yearMin: 2_045_000, yearMax: 2_108_000, champion: "Robert", sex: "M", championMin: 561_000, championMax: 621_000 }),
  reviewed(1940, { yearMin: 2_650_000, yearMax: 2_732_000, champion: "James", sex: "M", championMin: 756_000, championMax: 836_000 }),
  reviewed(1950, { yearMin: 3_920_000, yearMax: 4_041_000, champion: "James", sex: "M", championMin: 801_000, championMax: 886_000 }),
  reviewed(1960, { yearMin: 3_827_000, yearMax: 3_947_000, champion: "Michael", sex: "M", championMin: 791_000, championMax: 875_000 }),
  reviewed(1970, { yearMin: 2_993_000, yearMax: 3_087_000, champion: "Michael", sex: "M", championMin: 671_000, championMax: 743_000 }),
  {
    slug: "1980s",
    startYear: 1980,
    nominalEndYear: 1989,
    classroomYear: 1984,
    thesisSourceVersion: "ssa-national-2025",
    sanityAnchors: pilot1980Anchors,
    familyFile: "data/manual/spelling-families-1980.csv",
    rolloutState: "seeded",
  },
  reviewed(1990, { yearMin: 3_660_000, yearMax: 3_776_000, champion: "Michael", sex: "M", championMin: 439_000, championMax: 486_000 }),
  reviewed(2000, { yearMin: 3_761_000, yearMax: 3_881_000, champion: "Jacob", sex: "M", championMin: 260_000, championMax: 289_000 }),
  reviewed(2010, { yearMin: 3_649_000, yearMax: 3_765_000, champion: "Emma", sex: "F", championMin: 185_000, championMax: 205_000 }),
  reviewed(2020, { yearMin: 3_290_000, yearMax: 3_397_000, champion: "Liam", sex: "M", championMin: 118_000, championMax: 132_000 }),
] as const satisfies readonly DecadeHubDefinition[];

const DEFINITIONS_BY_SLUG = new Map<string, DecadeHubDefinition>(
  DECADE_HUB_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export function getDecadeHubDefinition(slug: string): DecadeHubDefinition | null {
  return DEFINITIONS_BY_SLUG.get(slug) ?? null;
}
