// Compatibility API for the 1980s decade hub. The implementation lives in
// decade-hub-compute-core.ts; keep these signatures for existing builders/tests.
import { getDecadeHubDefinition } from "./content/decade-hub-definitions";
import type {
  ClassroomResult,
  DecadeProfile,
  NameSummary,
  OwnershipResult,
  SpellingFamilyResult,
  SpellingFamilyYearPoint,
} from "./decade-hub-types";
import {
  apportionClassroomGeneric, buildDecadeProfileGeneric, buildSpellingFamiliesGeneric,
  computeOwnershipGeneric, computeTop1000YearsGeneric, createDecadeComputeConfig,
  evaluateSanityAnchors, isEligibleGeneric, summarizeRecordGeneric,
} from "./decade-hub-compute-core";
import type {
  DecadeHubSource,
  SourceNameRecord,
  NameDecadeStats,
  OwnershipComputation,
  FamilyBuildResult,
} from "./decade-hub-compute-core";
export * from "./decade-hub-compute-core";

export const DECADE_START = 1980;
export const DECADE_END = 1989;
export const CLASSROOM_YEAR = 1984;
export const CLASSROOM_SIZE = 30;
export const ELIGIBILITY_MIN_BIRTHS = 5000;
export const ELIGIBILITY_TOP1000_MIN_YEARS = 5;
export const OWNERSHIP_WEIGHT_CONCENTRATION = 0.7;
export const OWNERSHIP_WEIGHT_PROMINENCE = 0.3;
export const FAMILY_MIN_VARIANT_BIRTHS = 1000;
export const FAMILY_MIN_TOTAL_BIRTHS = 20000;
export const FAMILY_MIN_VARIANTS = 2;
export const DECADE_HUB_ALPHA = 2500;

const definition = getDecadeHubDefinition("1980s")!;
export const DECADE_COMPUTE_CONFIG = createDecadeComputeConfig({
  ...definition, alpha: DECADE_HUB_ALPHA,
  eligibilityMinBirths: ELIGIBILITY_MIN_BIRTHS,
  eligibilityTop1000MinYears: ELIGIBILITY_TOP1000_MIN_YEARS,
  familyMinVariantBirths: FAMILY_MIN_VARIANT_BIRTHS,
  familyMinTotalBirths: FAMILY_MIN_TOTAL_BIRTHS,
  familyMinVariants: FAMILY_MIN_VARIANTS,
  ownershipWeightConcentration: OWNERSHIP_WEIGHT_CONCENTRATION,
  ownershipWeightProminence: OWNERSHIP_WEIGHT_PROMINENCE,
});

export function summarizeRecord(rec: SourceNameRecord, dataThroughYear: number): NameDecadeStats {
  return summarizeRecordGeneric(rec, dataThroughYear, DECADE_COMPUTE_CONFIG);
}
export function computeTop1000Years(records: SourceNameRecord[]): Map<string, number> {
  return computeTop1000YearsGeneric(records, DECADE_COMPUTE_CONFIG);
}
export function isEligible(stats: NameDecadeStats, top1000Years: Map<string, number>): boolean {
  return isEligibleGeneric(stats, top1000Years, DECADE_COMPUTE_CONFIG);
}
export function computeOwnership(stats: NameDecadeStats[], top1000Years: Map<string, number>, alpha: number): OwnershipComputation {
  return computeOwnershipGeneric(stats, top1000Years, { ...DECADE_COMPUTE_CONFIG, alpha });
}
export function apportionClassroom(records: SourceNameRecord[], year: number, size: number, femaleTotal: number, maleTotal: number): ClassroomResult {
  return apportionClassroomGeneric(records, year, size, DECADE_COMPUTE_CONFIG, femaleTotal, maleTotal);
}
export function buildSpellingFamilies(csvText: string, records: SourceNameRecord[]): FamilyBuildResult {
  return buildSpellingFamiliesGeneric(csvText, records, DECADE_COMPUTE_CONFIG);
}
export interface BuildProfileInput { source: DecadeHubSource; alpha: number; familiesCsv: string; generatedAt: string; sourceVersion: string; gitCommit?: string; }
export function buildDecadeProfile(input: BuildProfileInput): DecadeProfile {
  const { alpha, ...profileInput } = input;
  return buildDecadeProfileGeneric({ ...profileInput, config: { ...DECADE_COMPUTE_CONFIG, alpha } });
}
export interface AnchorReport { totalBirths1984: number; michaelM1984: number; jenniferF1980s: number; }
export function assertSanityAnchors(source: DecadeHubSource): AnchorReport {
  const report = evaluateSanityAnchors(source, DECADE_COMPUTE_CONFIG);
  return { totalBirths1984: report.yearTotal1984!, michaelM1984: report.MichaelM1984!, jenniferF1980s: report.JenniferF1980s! };
}

// Re-export imported public types used by old consumers.
export type { ClassroomResult, DecadeProfile, NameSummary, OwnershipResult, SpellingFamilyResult, SpellingFamilyYearPoint } from "./decade-hub-types";
export type { DecadeHubSource, SourceNameRecord, NameDecadeStats, OwnershipComputation, FamilyBuildResult } from "./decade-hub-compute-core";
