// Decade hub data contracts (SPEC §2). These types cross the
// script → generated SQL/JSON → D1 → route boundary. Keep names/shapes EXACTLY.
//
// Backward-compatible additions approved by the orchestrator:
//   DecadeProfile.priorDecadeShareFemale / priorDecadeShareMale — the per-sex
//   priors actually used in scoring (SPEC §3 mandates per-sex priors; the
//   singular `priorDecadeShare` keeps the pooled value for transparency).

export const DECADE_HUB_METHODOLOGY_VERSION = "decade-hub/v1.0.0";

export type SanityAnchor =
  | {
      readonly kind: "year-total";
      readonly year: number;
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly kind: "record-year-count";
      readonly name: string;
      readonly sex: "F" | "M";
      readonly year: number;
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly kind: "record-decade-count";
      readonly name: string;
      readonly sex: "F" | "M";
      readonly min: number;
      readonly max?: number;
    }
  | {
      readonly kind: "minimum-decade-total";
      readonly min: number;
    };

export interface NameSummary {
  name: string; // display casing, e.g. "Michael"
  slug: string; // URL segment casing per repo convention (name pages 301 to canonical case)
  sex: "F" | "M";
  birthsInDecade: number;
  lifetimeBirths: number;
}

export interface OwnershipResult extends NameSummary {
  ownershipRank: number; // within its sex comparison set, 1-based, deterministic
  ownershipScore: number; // 0–100, keep 4 decimals in data, round only for display
  popularityRank: number; // rank by birthsInDecade within same set
  rankedYearsInDecade: number; // years 1980–89 with count >= 1 (i.e. present in data)
  decadeShare: number; // raw_concentration (kept for transparency, never labeled "the score")
  adjustedConcentration: number;
  normalizedConcentration: number;
  normalizedProminence: number;
  peakYear: number;
  peakCount: number;
  firstYear: number;
  lastYear: number;
  status: string; // from names.status via shards/D1 if available; else "unknown"
}

export interface ClassroomStudent {
  name: string;
  slug: string;
  sex: "F" | "M";
  seats: number;
}

export interface ClassroomResult {
  year: number;
  size: 30;
  femaleSeats: number;
  maleSeats: number; // from actual 1984 national distribution
  students: ClassroomStudent[]; // expanded 30-entry roster, deterministic order
  uniqueNames: number;
  repeatedNames: number; // repeatedNames = size - uniqueNames
  mostRepeated: { name: string; slug: string; seats: number };
  topShare: number; // seats held by the single most frequent name / 30
}

export interface SpellingFamilyYearPoint {
  year: number;
  total: number;
  [variant: string]: number;
}

export interface SpellingFamilyResult {
  id: string;
  label: string;
  canonicalDisplayName: string;
  variants: {
    name: string;
    slug: string;
    birthsInDecade: number;
    decadeRank: number | null;
    shareOfFamily: number;
  }[];
  totalBirthsInDecade: number;
  combinedDecadeRank: number; // rank the family total WOULD have in the decade table
  dominantVariant: string;
  peakYear: number; // year of max combined total within 1980–89
  yearly: SpellingFamilyYearPoint[]; // 10 points, 1980–1989
  rationale: string;
  reviewStatus: "approved";
}

export interface DecadeProfile {
  decade: number;
  startYear: number;
  endYear: number;
  /** Calendar end of the nominal decade, even when actual coverage is partial. */
  nominalEndYear: number;
  dataThroughYear: number;
  isComplete: boolean;
  totalBirths: number;
  femaleBirths: number;
  maleBirths: number;
  distinctNames: number; // distinct name+sex rows with any 1980s births
  top10Share: number;
  top100Share: number; // 0–1, pooled both sexes; document pooling in methodology
  diversityScore: number; // 0–100, see §4
  effectiveNames: number; // N_eff = exp(H), pooled
  concentrationScore: number; // 0–100, see §4
  femaleChampion: NameSummary;
  maleChampion: NameSummary;
  ownershipRankings: {
    female: OwnershipResult[]; // full eligible set, sorted ownershipScore desc
    male: OwnershipResult[];
    mostOwned: OwnershipResult[]; // top 25 across sexes by ownershipScore (sex-tagged)
    mostPopular: OwnershipResult[]; // top 25 across sexes by birthsInDecade
    popularButTimeless: OwnershipResult[]; // rule in §5
    unexpected: OwnershipResult[]; // rule in §5
  };
  alpha: number;
  priorDecadeShare: number; // pooled eligible-set prior (kept for transparency)
  priorDecadeShareFemale: number; // per-sex prior actually used in F scoring
  priorDecadeShareMale: number; // per-sex prior actually used in M scoring
  classroomDefaults: ClassroomResult;
  spellingFamilies: SpellingFamilyResult[];
  methodologyVersion: string;
  generatedAt: string;
  sourceVersion: string;
  gitCommit?: string;
}
