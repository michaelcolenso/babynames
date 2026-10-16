// Content Factory — shared types.
// One ContentDefinition drives both a viz page and a blog post from the
// same computed numbers. See docs/superpowers/specs/2026-08-22-content-factory-design.md.

export interface FlashFloodMember {
  name: string;
  sex: string;
  firstYear: number;
  peakYear: number;
  peakCount: number;
  lastYear: number;
  lastCount: number;
  series: Record<number, number>;
}

export interface FlashFloodsResult {
  members: FlashFloodMember[];
  totalNames: number;
}

/** Slow rise, slow fall — the glacier archetype of the wave-topology family. */
export interface GlacierMember {
  name: string;
  sex: string;
  riseStartYear: number; // first year at >= thresholdShare of peak before the peak
  peakYear: number;
  peakCount: number;
  fallEndYear: number; // last year at >= thresholdShare of peak
  fallEndCount: number;
  finalCount: number; // count at dataMaxYear (0 if absent)
  series: Record<number, number>;
}

export interface GlaciersResult {
  members: GlacierMember[];
  totalNames: number;
}

/**
 * The grandmother-names family: a name whose living population is old.
 * Living counts and ages are estimates — SSA births aged to `analysisYear`
 * with the shared life table (see @nv/shared/life-table).
 */
export interface GrandmotherMember {
  name: string;
  sex: string;
  firstYear: number;
  peakYear: number;
  peakCount: number;
  /** Estimated living bearers at the analysis year. */
  livingEst: number;
  /** Median age of those living bearers. */
  medianAge: number;
  /** Share of living bearers aged 50+ (0–1). */
  over50Share: number;
  /** Share of living bearers under 18 (0–1). */
  under18Share: number;
  lastBirthYear: number;
  /** Recorded births in the most recent data year (0 = below the SSA floor). */
  latestCount: number;
  series: Record<number, number>;
}

export interface GrandmotherNamesResult {
  members: GrandmotherMember[];
  totalNames: number;
  /** Names at or above the living floor (the pool the family is drawn from). */
  atFloor: number;
  analysisYear: number;
  /** Lowest median age among names at/above the living floor — the contrast case. */
  youngest: GrandmotherMember | null;
  /**
   * Names that clear the 50+ share but sit between `nearMissFloor` and
   * `minLiving` and belong to boys — the nickname tier the headline list misses.
   */
  maleNearMisses: GrandmotherMember[];
  nearMissFloor: number;
}

/** Union accepted by claim functions / renderers across families. */
export type FactoryResult =
  | FlashFloodsResult
  | GlaciersResult
  | GrandmotherNamesResult;

export type FactoryKind = "viz" | "post" | "both";
export type FactoryRolloutState = "draft" | "reviewed" | "published";

export type ComputeSpec =
  | {
      family: "flash-floods";
      minPeak?: number;
      peakWindow?: number;
      decayRatio?: number;
      decayYears?: number;
      limit?: number;
    }
  | {
      family: "glaciers";
      minPeak?: number;
      minRiseYears?: number;
      minFallYears?: number;
      thresholdShare?: number;
    }
  | {
      family: "grandmother-names";
      /** Living-population floor for a name to be considered (default 100,000). */
      minLiving?: number;
      /** Share of living bearers that must be 50+ (default 0.9). */
      minOver50Share?: number;
      /** Reference year the birth cohorts are aged to (default 2026). */
      analysisYear?: number;
    };

export type ClaimValue = number | string;

export interface FactoryAssert {
  key: string;
  equals?: ClaimValue;
  approx?: [number, number];
}

/** Second claim argument: family totals, plus fields that live outside `members`. */
export interface ClaimMeta {
  totalNames: number;
  /** Populated by the grandmother-names family. */
  youngest?: GrandmotherMember | null;
  /** Populated by the grandmother-names family (birth cohorts are aged to it). */
  analysisYear?: number;
  /** Populated by the grandmother-names family: names at/above the living floor. */
  atFloor?: number;
  /** Grandmother-names family: boys' names between `nearMissFloor` and the floor. */
  maleNearMisses?: GrandmotherMember[];
}

export interface ContentDefinition {
  slug: string;
  kind: FactoryKind;
  title: string;
  description: string;
  sourceVersion: string;
  rolloutState: FactoryRolloutState;
  compute: ComputeSpec;
  /** Member keys ("Name|SEX") to render chart panels for in the post body. */
  panels?: string[];
  /** Viz footer note describing detection criteria (defaults to flash-floods wording). */
  sourceNote?: string;
  claims: Record<
    string,
    (
      members: Array<FlashFloodMember | GlacierMember | GrandmotherMember>,
      meta: ClaimMeta,
    ) => ClaimValue
  >;
  asserts?: FactoryAssert[];
}
