// Thin compatibility wrapper for the reviewed decade-hub pilot.
import { DecadeHero as DecadeHeroGeneric, DecadeScorecard, DecadeYearLinks, ClassroomRoster, ClassroomStats, ClassroomSummary as ClassroomSummaryGeneric, DataCoverageBadge, MethodologyCallout, MetricDefinition, OwnershipRanking as OwnershipRankingGeneric, OwnershipTable as OwnershipTableGeneric, SPELLING_FAMILY_COPY_RULE, SpellingFamilyCard as SpellingFamilyCardGeneric, SpellingFamilyChart, SpellingFamilySummaryCard, renderDecadeClassroomGeneric, renderDecadeHubGeneric, renderDecadeMethodologyGeneric, renderDecadeSpellingFamiliesGeneric, createDecadeRenderContext, type DecadePageOpts } from "./render-decade-hub-core";
import { getDecadeHubDefinition } from "./content/decade-hub-definitions";
import { DECADE_THESES, type DecadeThesis } from "./content/decade-theses";
import type { ClassroomResult, DecadeProfile, OwnershipResult, SpellingFamilyResult } from "./decade-hub-types";
export type { DecadePageOpts } from "./render-decade-hub-core";
const DEFINITION = getDecadeHubDefinition("1920s")!;
const THESIS = DECADE_THESES[DEFINITION.slug];
function renderOptions(opts: DecadePageOpts) { return { ...opts, definition:DEFINITION, thesis:THESIS }; }
export function DecadeHero(profile: DecadeProfile, thesis: { heading: string; paragraphs: string[] } | undefined): string { const compatibleThesis=thesis ? { ...thesis, sourceVersion:Object.hasOwn(thesis, "sourceVersion") ? (thesis as DecadeThesis).sourceVersion : profile.sourceVersion } : undefined; return DecadeHeroGeneric(profile, compatibleThesis, createDecadeRenderContext(profile, { origin:"", definition:DEFINITION, thesis:compatibleThesis })); }
export { DecadeScorecard, DecadeYearLinks, ClassroomRoster, ClassroomStats, SPELLING_FAMILY_COPY_RULE, SpellingFamilyChart, SpellingFamilySummaryCard, MethodologyCallout, MetricDefinition, DataCoverageBadge };
export function OwnershipExplainer(): string { return `<div class="dh-explainer"><p><strong>Popularity measures size. Ownership measures identity.</strong> Some names remain popular for generations. Others overwhelmingly belong to one decade.</p><p class="dh-explainer-note">It is a descriptive statistic about SSA birth records, not a verdict about culture.</p></div>`; }
export function OwnershipTable(rows: OwnershipResult[], opts: { caption:string; showSex?:boolean }): string { return OwnershipTableGeneric(rows, { ...opts, period:"1920s" }); }
export function OwnershipRanking(profile: DecadeProfile): string { return OwnershipRankingGeneric(profile); }
export function ClassroomSummary(classroom: ClassroomResult): string { return ClassroomSummaryGeneric(classroom); }
export function SpellingFamilyCard(family: SpellingFamilyResult): string { return SpellingFamilyCardGeneric(family); }
export async function fetchDecadeHubProfile1920(db: D1Database, decadeLabel = "1920s"): Promise<DecadeProfile | null> { try { const row=await db.prepare("SELECT payload FROM decade_hub WHERE decade = ?1").bind(decadeLabel).first<{payload:string}>(); if(!row || typeof row.payload !== "string") return null; const profile=JSON.parse(row.payload) as DecadeProfile; return profile?.decade === DEFINITION.startYear && profile.ownershipRankings && profile.classroomDefaults && Array.isArray(profile.spellingFamilies) ? profile : null; } catch { return null; } }
export function renderDecadeHub1920(profile: DecadeProfile, opts: DecadePageOpts): string { return renderDecadeHubGeneric(profile, { ...renderOptions(opts), decadeNavigation:"adjacent-only" }); }
export function renderDecadeClassroom1920(profile: DecadeProfile, opts: DecadePageOpts): string { return renderDecadeClassroomGeneric(profile, renderOptions(opts)); }
export function renderDecadeSpellingFamilies1920(profile: DecadeProfile, opts: DecadePageOpts): string { return renderDecadeSpellingFamiliesGeneric(profile, renderOptions(opts)); }
export function renderDecadeMethodology1920(profile: DecadeProfile, opts: DecadePageOpts): string { return renderDecadeMethodologyGeneric(profile, renderOptions(opts)); }
