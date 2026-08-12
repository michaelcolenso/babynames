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

const draft = (startYear: number): DecadeHubDefinition => ({
  slug: `${startYear}s`,
  startYear,
  nominalEndYear: startYear + 9,
  classroomYear: startYear + 4,
  thesisSourceVersion: "",
  sanityAnchors: [],
  familyFile: `data/manual/spelling-families-${startYear}.csv`,
  rolloutState: "draft",
});

/** The only checked-in list of decade hubs, in chronological order. */
export const DECADE_HUB_DEFINITIONS = [
  draft(1880),
  draft(1890),
  draft(1900),
  draft(1910),
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
  draft(1930),
  draft(1940),
  draft(1950),
  draft(1960),
  draft(1970),
  {
    slug: "1980s",
    startYear: 1980,
    nominalEndYear: 1989,
    classroomYear: 1984,
    thesisSourceVersion: "ssa-national-2025",
    sanityAnchors: pilot1980Anchors,
    familyFile: "data/manual/spelling-families.csv",
    rolloutState: "seeded",
  },
  draft(1990),
  draft(2000),
  draft(2010),
  draft(2020),
] as const satisfies readonly DecadeHubDefinition[];

const DEFINITIONS_BY_SLUG = new Map<string, DecadeHubDefinition>(
  DECADE_HUB_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export function getDecadeHubDefinition(slug: string): DecadeHubDefinition | null {
  return DEFINITIONS_BY_SLUG.get(slug) ?? null;
}
