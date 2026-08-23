// Content Factory — shared types.
// One ContentDefinition drives both a viz page and a blog post from the
// same computed numbers. See docs/superpowers/specs/2026-08-22-content-factory-design.md.

export type FactoryKind = "viz" | "post" | "both";
export type FactoryRolloutState = "draft" | "reviewed" | "published";

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

export type ComputeSpec =
  | {
      family: "flash-floods";
      minPeak?: number;
      peakWindow?: number;
      decayRatio?: number;
      decayYears?: number;
      limit?: number;
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
  claims: Record<
    string,
    (members: FlashFloodMember[], meta: { totalNames: number }) => ClaimValue
  >;
  asserts?: FactoryAssert[];
}
