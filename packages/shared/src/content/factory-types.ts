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

/** Union accepted by claim functions / renderers across families. */
export type FactoryResult = FlashFloodsResult | GlaciersResult;

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
    };

export type ClaimValue = number | string;

export interface FactoryAssert {
  key: string;
  equals?: ClaimValue;
  approx?: [number, number];
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
      members: Array<FlashFloodMember | GlacierMember>,
      meta: { totalNames: number },
    ) => ClaimValue
  >;
  asserts?: FactoryAssert[];
}
