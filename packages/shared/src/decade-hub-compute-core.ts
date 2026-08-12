// Generic deterministic compute functions for configured decade hubs.
// No I/O in this module; callers load source data and pass plain records in.

import { classify } from "./classify";
import type {
  ClassroomResult,
  ClassroomStudent,
  DecadeProfile,
  NameSummary,
  OwnershipResult,
  SanityAnchor,
  SpellingFamilyResult,
  SpellingFamilyYearPoint,
} from "./decade-hub-types";
import { DECADE_HUB_METHODOLOGY_VERSION } from "./decade-hub-types";

export type Sex = "F" | "M";
export interface SourceNameRecord { name: string; sex: Sex; series: Record<number, number>; }
export interface DecadeHubSource { minYear: number; maxYear: number; records: SourceNameRecord[]; }

export interface DecadeComputeConfig {
  startYear: number;
  nominalEndYear: number;
  classroomYear: number;
  alpha: number;
  eligibilityMinBirths: number;
  eligibilityTop1000MinYears: number;
  familyMinVariantBirths: number;
  familyMinTotalBirths: number;
  familyMinVariants: number;
  ownershipWeightConcentration: number;
  ownershipWeightProminence: number;
  sanityAnchors: readonly SanityAnchor[];
}

export function createDecadeComputeConfig(input: {
  startYear: number; nominalEndYear: number; classroomYear: number;
  alpha?: number; eligibilityMinBirths?: number; eligibilityTop1000MinYears?: number;
  familyMinVariantBirths?: number; familyMinTotalBirths?: number; familyMinVariants?: number;
  ownershipWeightConcentration?: number; ownershipWeightProminence?: number;
  sanityAnchors?: readonly SanityAnchor[];
}): DecadeComputeConfig {
  return {
    startYear: input.startYear,
    nominalEndYear: input.nominalEndYear,
    classroomYear: input.classroomYear,
    alpha: input.alpha ?? 2500,
    eligibilityMinBirths: input.eligibilityMinBirths ?? 5000,
    eligibilityTop1000MinYears: input.eligibilityTop1000MinYears ?? 5,
    familyMinVariantBirths: input.familyMinVariantBirths ?? 1000,
    familyMinTotalBirths: input.familyMinTotalBirths ?? 20000,
    familyMinVariants: input.familyMinVariants ?? 2,
    ownershipWeightConcentration: input.ownershipWeightConcentration ?? 0.7,
    ownershipWeightProminence: input.ownershipWeightProminence ?? 0.3,
    sanityAnchors: input.sanityAnchors ?? [],
  };
}

export interface DecadeCoverage { startYear: number; endYear: number; isComplete: boolean; }
export function computeDecadeCoverage(source: DecadeHubSource, config: DecadeComputeConfig): DecadeCoverage {
  if (source.maxYear < config.startYear) throw new Error(`source max year ${source.maxYear} is before decade start ${config.startYear}`);
  const endYear = Math.min(config.nominalEndYear, source.maxYear);
  if (config.classroomYear < config.startYear || config.classroomYear > endYear) {
    throw new Error(`classroom year ${config.classroomYear} is outside actual coverage ${config.startYear}–${endYear}`);
  }
  return { startYear: config.startYear, endYear, isComplete: endYear === config.nominalEndYear };
}

export const CLASSROOM_SIZE = 30;
export function round4(n: number): number { return Math.round(n * 1e4) / 1e4; }
export function round6(n: number): number { return Math.round(n * 1e6) / 1e6; }
function nameKey(sex: Sex, name: string): string { return `${sex}|${name.toLowerCase()}`; }
export function compareByBirths(a: { birthsInDecade: number; name: string }, b: { birthsInDecade: number; name: string }): number {
  if (b.birthsInDecade !== a.birthsInDecade) return b.birthsInDecade - a.birthsInDecade;
  const al = a.name.toLowerCase(); const bl = b.name.toLowerCase();
  return al < bl ? -1 : al > bl ? 1 : 0;
}
export function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) throw new Error("percentile of empty set");
  return sortedAsc[Math.floor(p * (sortedAsc.length - 1))]!;
}
export function median(sortedAsc: number[]): number { return percentile(sortedAsc, 0.5); }

export interface NameDecadeStats {
  name: string; slug: string; sex: Sex; birthsInDecade: number; lifetimeBirths: number;
  firstYear: number; lastYear: number; peakYear: number; peakCount: number;
  rankedYearsInDecade: number; status: string; yearlyInDecade: Record<number, number>;
}
export function summarizeRecordGeneric(rec: SourceNameRecord, dataThroughYear: number, config: DecadeComputeConfig, actualEndYear = config.nominalEndYear): NameDecadeStats {
  let lifetimeBirths = 0; let birthsInDecade = 0; let rankedYearsInDecade = 0;
  const yearlyInDecade: Record<number, number> = {};
  for (const [yearStr, count] of Object.entries(rec.series)) {
    const year = Number(yearStr); if (count <= 0) continue;
    lifetimeBirths += count;
    if (year >= config.startYear && year <= actualEndYear) {
      birthsInDecade += count; rankedYearsInDecade += 1; yearlyInDecade[year] = count;
    }
  }
  const c = classify({ series: rec.series, yM: dataThroughYear });
  return { name: rec.name, slug: rec.name, sex: rec.sex, birthsInDecade, lifetimeBirths,
    firstYear: c?.firstYear ?? 0, lastYear: c?.lastYear ?? 0, peakYear: c?.peakYear ?? 0,
    peakCount: c?.peakCount ?? 0, rankedYearsInDecade, status: c?.status ?? "unknown", yearlyInDecade };
}

export function computeTop1000YearsGeneric(records: SourceNameRecord[], config: DecadeComputeConfig, actualEndYear = config.nominalEndYear): Map<string, number> {
  const result = new Map<string, number>();
  for (const sex of ["F", "M"] as const) {
    for (let year = config.startYear; year <= actualEndYear; year++) {
      const present: { name: string; count: number }[] = [];
      for (const rec of records) { if (rec.sex !== sex) continue; const count = rec.series[year] ?? 0; if (count >= 1) present.push({ name: rec.name, count }); }
      present.sort((a, b) => b.count !== a.count ? b.count - a.count : a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      for (let i = 0; i < Math.min(1000, present.length); i++) {
        const key = nameKey(sex, present[i]!.name); result.set(key, (result.get(key) ?? 0) + 1);
      }
    }
  }
  return result;
}
export function isEligibleGeneric(stats: NameDecadeStats, top1000Years: Map<string, number>, config: DecadeComputeConfig): boolean {
  return stats.birthsInDecade >= config.eligibilityMinBirths || (top1000Years.get(nameKey(stats.sex, stats.name)) ?? 0) >= config.eligibilityTop1000MinYears;
}

export interface OwnershipComputation { female: OwnershipResult[]; male: OwnershipResult[]; priorDecadeShareFemale: number; priorDecadeShareMale: number; priorDecadeSharePooled: number; }
interface WorkingRow extends NameDecadeStats { adjusted: number; rawProminence: number; }
function rankSexSet(eligible: NameDecadeStats[], config: DecadeComputeConfig): { rows: OwnershipResult[]; prior: number } {
  const sumDecade = eligible.reduce((n, e) => n + e.birthsInDecade, 0); const sumLifetime = eligible.reduce((n, e) => n + e.lifetimeBirths, 0);
  const prior = sumLifetime > 0 ? sumDecade / sumLifetime : 0;
  const working: WorkingRow[] = eligible.map((e) => ({ ...e, adjusted: (e.birthsInDecade + config.alpha * prior) / (e.lifetimeBirths + config.alpha), rawProminence: Math.log(1 + e.birthsInDecade) }));
  const minAdj = Math.min(...working.map((w) => w.adjusted)); const maxAdj = Math.max(...working.map((w) => w.adjusted));
  const minProm = Math.min(...working.map((w) => w.rawProminence)); const maxProm = Math.max(...working.map((w) => w.rawProminence));
  const adjSpan = maxAdj - minAdj; const promSpan = maxProm - minProm;
  const rows: OwnershipResult[] = working.map((w) => {
    const normConc = adjSpan > 0 ? (w.adjusted - minAdj) / adjSpan : 0; const normProm = promSpan > 0 ? (w.rawProminence - minProm) / promSpan : 0;
    return { name: w.name, slug: w.slug, sex: w.sex, birthsInDecade: w.birthsInDecade, lifetimeBirths: w.lifetimeBirths,
      ownershipRank: 0, ownershipScore: round4(100 * (config.ownershipWeightConcentration * normConc + config.ownershipWeightProminence * normProm)), popularityRank: 0,
      rankedYearsInDecade: w.rankedYearsInDecade, decadeShare: round6(w.lifetimeBirths > 0 ? w.birthsInDecade / w.lifetimeBirths : 0), adjustedConcentration: round6(w.adjusted),
      normalizedConcentration: round6(normConc), normalizedProminence: round6(normProm), peakYear: w.peakYear, peakCount: w.peakCount, firstYear: w.firstYear, lastYear: w.lastYear, status: w.status };
  });
  const byScore = [...rows].sort((a, b) => b.ownershipScore !== a.ownershipScore ? b.ownershipScore - a.ownershipScore : compareByBirths(a, b));
  byScore.forEach((row, i) => { row.ownershipRank = i + 1; });
  [...rows].sort(compareByBirths).forEach((row, i) => { row.popularityRank = i + 1; });
  return { rows: byScore, prior };
}
export function computeOwnershipGeneric(stats: NameDecadeStats[], top1000Years: Map<string, number>, config: DecadeComputeConfig): OwnershipComputation {
  const female = rankSexSet(stats.filter((s) => s.sex === "F" && isEligibleGeneric(s, top1000Years, config)), config);
  const male = rankSexSet(stats.filter((s) => s.sex === "M" && isEligibleGeneric(s, top1000Years, config)), config);
  const selected = [...stats.filter((s) => s.sex === "F" && isEligibleGeneric(s, top1000Years, config)), ...stats.filter((s) => s.sex === "M" && isEligibleGeneric(s, top1000Years, config))];
  const totalDecade = selected.reduce((n, s) => n + s.birthsInDecade, 0); const totalLifetime = selected.reduce((n, s) => n + s.lifetimeBirths, 0);
  return { female: female.rows, male: male.rows, priorDecadeShareFemale: round6(female.prior), priorDecadeShareMale: round6(male.prior), priorDecadeSharePooled: round6(totalLifetime > 0 ? totalDecade / totalLifetime : 0) };
}
export interface OwnershipViews { mostOwned: OwnershipResult[]; mostPopular: OwnershipResult[]; popularButTimeless: OwnershipResult[]; unexpected: OwnershipResult[]; }
export function computeOwnershipViews(female: OwnershipResult[], male: OwnershipResult[]): OwnershipViews {
  const pooled = [...female, ...male]; const mostOwned = [...pooled].sort((a, b) => b.ownershipScore !== a.ownershipScore ? b.ownershipScore - a.ownershipScore : compareByBirths(a, b)).slice(0, 25);
  const mostPopular = [...pooled].sort(compareByBirths).slice(0, 25); const birthsAsc = pooled.map((r) => r.birthsInDecade).sort((a, b) => a - b); const concAsc = pooled.map((r) => r.adjustedConcentration).sort((a, b) => a - b);
  const popularButTimeless = pooled.filter((r) => r.birthsInDecade >= median(birthsAsc) && r.adjustedConcentration <= percentile(concAsc, 0.25)).sort(compareByBirths).slice(0, 25);
  const unexpected = pooled.map((row) => ({ row, delta: row.popularityRank - row.ownershipRank })).filter((x) => x.delta >= 20).sort((a, b) => b.delta !== a.delta ? b.delta - a.delta : compareByBirths(a.row, b.row)).slice(0, 25).map((x) => x.row);
  return { mostOwned, mostPopular, popularButTimeless, unexpected };
}

export interface DiversityMetrics { totalBirths: number; femaleBirths: number; maleBirths: number; distinctNames: number; top10Share: number; top100Share: number; diversityScore: number; effectiveNames: number; concentrationScore: number; }
export function computeDiversityMetrics(stats: NameDecadeStats[]): DiversityMetrics {
  const present = stats.filter((s) => s.birthsInDecade > 0); const totalBirths = present.reduce((n, s) => n + s.birthsInDecade, 0); const femaleBirths = present.filter((s) => s.sex === "F").reduce((n, s) => n + s.birthsInDecade, 0); const maleBirths = totalBirths - femaleBirths; const n = present.length;
  if (totalBirths <= 0 || n === 0) throw new Error("no decade births in source data");
  let h = 0; let hhi = 0; for (const s of present) { const p = s.birthsInDecade / totalBirths; h -= p * Math.log(p); hhi += p * p; }
  const sorted = [...present].sort(compareByBirths); const shareOf = (k: number) => sorted.slice(0, k).reduce((a, s) => a + s.birthsInDecade, 0) / totalBirths;
  return { totalBirths, femaleBirths, maleBirths, distinctNames: n, top10Share: round6(shareOf(10)), top100Share: round6(shareOf(100)), diversityScore: round4(100 * (h / Math.log(n))), effectiveNames: Math.round(Math.exp(h) * 100) / 100, concentrationScore: round4(100 * ((hhi - 1 / n) / (1 - 1 / n))) };
}

export function apportionClassroomGeneric(records: SourceNameRecord[], year: number, size: number, config: DecadeComputeConfig, femaleTotal: number, maleTotal: number): ClassroomResult {
  if (year !== config.classroomYear || size !== CLASSROOM_SIZE) throw new Error(`v1 classroom is fixed at ${config.classroomYear}/${CLASSROOM_SIZE} seats`);
  const femaleSeats = Math.round((size * femaleTotal) / (femaleTotal + maleTotal)); const maleSeats = size - femaleSeats; const students: ClassroomStudent[] = []; const seatTable = new Map<string, ClassroomStudent>();
  for (const sex of ["F", "M"] as const) {
    const sexSeats = sex === "F" ? femaleSeats : maleSeats; const sexTotal = sex === "F" ? femaleTotal : maleTotal;
    const pool: { name: string; count: number; floor: number; remainder: number }[] = [];
    for (const rec of records) { if (rec.sex !== sex) continue; const count = rec.series[year] ?? 0; if (count < 1) continue; const expected = (count / sexTotal) * sexSeats; const floor = Math.floor(expected); pool.push({ name: rec.name, count, floor, remainder: expected - floor }); }
    let remaining = sexSeats - pool.reduce((n, p) => n + p.floor, 0); if (remaining < 0) throw new Error("floor apportionment overshot the seat count");
    const ordered = [...pool].sort((a, b) => b.remainder !== a.remainder ? b.remainder - a.remainder : b.count !== a.count ? b.count - a.count : a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    const bonus = new Set(ordered.slice(0, remaining).map((p) => p.name.toLowerCase())); remaining = Math.max(0, remaining - ordered.length);
    if (remaining > 0 && ordered.length) bonus.add(ordered[0]!.name.toLowerCase());
    for (const p of pool) { const seats = p.floor + (bonus.has(p.name.toLowerCase()) ? 1 : 0); if (seats < 1) continue; const key = nameKey(sex, p.name); const existing = seatTable.get(key); if (existing) existing.seats += seats; else seatTable.set(key, { name: p.name, slug: p.name, sex, seats }); }
  }
  const ordered = [...seatTable.values()].sort((a, b) => b.seats !== a.seats ? b.seats - a.seats : a.name.toLowerCase() !== b.name.toLowerCase() ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.sex.localeCompare(b.sex));
  for (const entry of ordered) for (let i = 0; i < entry.seats; i++) students.push({ name: entry.name, slug: entry.slug, sex: entry.sex, seats: entry.seats });
  if (students.length !== size) throw new Error(`classroom produced ${students.length} students, expected ${size}`);
  const mostRepeated = ordered[0]!; return { year, size: 30, femaleSeats, maleSeats, students, uniqueNames: ordered.length, repeatedNames: size - ordered.length, mostRepeated: { name: mostRepeated.name, slug: mostRepeated.slug, seats: mostRepeated.seats }, topShare: round4(mostRepeated.seats / size) };
}

export interface SpellingFamilyCsvRow { familyId: string; label: string; canonical: string; variant: string; reviewStatus: string; rationale: string; }
export function parseCsv(text: string): string[][] { const rows: string[][] = []; let field = ""; let row: string[] = []; let quoted = false; for (let i = 0; i < text.length; i++) { const ch = text[i]!; if (quoted) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch; } else if (ch === '"') quoted = true; else if (ch === ",") { row.push(field); field = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(field); field = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; } else field += ch; } if (field !== "" || row.length) { row.push(field); rows.push(row); } return rows; }
export function parseSpellingFamiliesCsv(text: string): SpellingFamilyCsvRow[] { const rows = parseCsv(text); if (!rows.length) return []; const expected = ["family_id", "label", "canonical", "variant", "review_status", "rationale"]; if (expected.some((e, i) => rows[0]![i]?.trim() !== e)) throw new Error(`spelling-families.csv header must be ${expected.join(",")}`); return rows.slice(1).map((r) => ({ familyId: r[0]!.trim(), label: r[1]!.trim(), canonical: r[2]!.trim(), variant: r[3]!.trim(), reviewStatus: r[4]!.trim(), rationale: r[5]!.trim() })); }
export interface FamilyBuildResult { families: SpellingFamilyResult[]; skipped: { familyId: string; reason: string }[]; }
export function buildSpellingFamiliesGeneric(csvText: string, records: SourceNameRecord[], config: DecadeComputeConfig, actualEndYear = config.nominalEndYear): FamilyBuildResult {
  const rows = parseSpellingFamiliesCsv(csvText).filter((r) => r.reviewStatus === "approved"); const rankTables = new Map<Sex, Map<string, number>>(); const decadeBirths = new Map<string, number>(); const bySexName = new Map<string, SourceNameRecord>();
  for (const rec of records) { bySexName.set(nameKey(rec.sex, rec.name), rec); let b = 0; for (let y = config.startYear; y <= actualEndYear; y++) b += rec.series[y] ?? 0; decadeBirths.set(nameKey(rec.sex, rec.name), b); }
  for (const sex of ["F", "M"] as const) { const entries = records.filter((r) => r.sex === sex).map((r) => ({ name: r.name, birthsInDecade: decadeBirths.get(nameKey(sex, r.name)) ?? 0 })).filter((e) => e.birthsInDecade > 0).sort(compareByBirths); rankTables.set(sex, new Map(entries.map((e, i) => [e.name.toLowerCase(), i + 1]))); }
  const byFamily = new Map<string, SpellingFamilyCsvRow[]>(); for (const r of rows) byFamily.set(r.familyId, [...(byFamily.get(r.familyId) ?? []), r]); const families: SpellingFamilyResult[] = []; const skipped: { familyId: string; reason: string }[] = [];
  for (const familyId of [...byFamily.keys()].sort()) {
    const group = byFamily.get(familyId)!; const variantNames = [...new Set(group.map((r) => r.variant.toLowerCase()))].map((key) => group.find((r) => r.variant.toLowerCase() === key)!.variant); const canonical = group[0]!.canonical; const canonF = decadeBirths.get(nameKey("F", canonical)) ?? 0; const canonM = decadeBirths.get(nameKey("M", canonical)) ?? 0; const sex: Sex = canonF >= canonM ? "F" : "M"; const table = rankTables.get(sex)!; const variants: SpellingFamilyResult["variants"] = []; const yearlyByVariant = new Map<string, Record<number, number>>(); let total = 0; let fail: string | null = null;
    for (const variant of variantNames) { const rec = bySexName.get(nameKey(sex, variant)); const births = decadeBirths.get(nameKey(sex, variant)) ?? 0; if (!rec || births < config.familyMinVariantBirths) { fail = `variant ${variant} has ${births} ${sex} births in decade (< ${config.familyMinVariantBirths})`; break; } total += births; const yearly: Record<number, number> = {}; for (let y = config.startYear; y <= actualEndYear; y++) yearly[y] = rec.series[y] ?? 0; yearlyByVariant.set(variant, yearly); variants.push({ name: variant, slug: variant, birthsInDecade: births, decadeRank: table.get(variant.toLowerCase()) ?? null, shareOfFamily: 0 }); }
    if (fail) { skipped.push({ familyId, reason: fail }); continue; } if (variants.length < config.familyMinVariants) { skipped.push({ familyId, reason: `only ${variants.length} qualifying variants (< ${config.familyMinVariants})` }); continue; } if (total < config.familyMinTotalBirths) { skipped.push({ familyId, reason: `combined ${total} births (< ${config.familyMinTotalBirths})` }); continue; }
    for (const v of variants) v.shareOfFamily = round6(v.birthsInDecade / total); const dominant = [...variants].sort(compareByBirths)[0]!.name; const yearly: SpellingFamilyYearPoint[] = []; for (let y = config.startYear; y <= actualEndYear; y++) { const point: SpellingFamilyYearPoint = { year: y, total: 0 }; for (const v of variantNames) { const count = yearlyByVariant.get(v)![y] ?? 0; point[v] = count; point.total += count; } yearly.push(point); } let peakYear = config.startYear; let peakTotal = -1; for (const point of yearly) if (point.total > peakTotal) { peakTotal = point.total; peakYear = point.year; }
    let combinedRank = 1; for (const value of [...decadeBirths.entries()].filter(([key]) => key.startsWith(`${sex}|`)).map(([, value]) => value).filter((value) => value > total)) combinedRank++; families.push({ id: familyId, label: group[0]!.label, canonicalDisplayName: canonical, variants, totalBirthsInDecade: total, combinedDecadeRank: combinedRank, dominantVariant: dominant, peakYear, yearly, rationale: group[0]!.rationale, reviewStatus: "approved" });
  }
  families.sort((a, b) => b.totalBirthsInDecade - a.totalBirthsInDecade || a.id.localeCompare(b.id)); return { families, skipped };
}

function championOf(rows: OwnershipResult[]): NameSummary { const top = [...rows].sort(compareByBirths)[0]!; return { name: top.name, slug: top.slug, sex: top.sex, birthsInDecade: top.birthsInDecade, lifetimeBirths: top.lifetimeBirths }; }
export interface BuildProfileInputGeneric { source: DecadeHubSource; config: DecadeComputeConfig; familiesCsv: string; generatedAt: string; sourceVersion: string; gitCommit?: string; }
export function buildDecadeProfileGeneric(input: BuildProfileInputGeneric): DecadeProfile {
  const { source, config } = input; const coverage = computeDecadeCoverage(source, config); const stats = source.records.map((r) => summarizeRecordGeneric(r, source.maxYear, config, coverage.endYear)); const top1000 = computeTop1000YearsGeneric(source.records, config, coverage.endYear); const ownership = computeOwnershipGeneric(stats, top1000, config); const views = computeOwnershipViews(ownership.female, ownership.male); const diversity = computeDiversityMetrics(stats); const classroom = apportionClassroomGeneric(source.records, config.classroomYear, CLASSROOM_SIZE, config, statsYearTotal(source.records, config.classroomYear, "F"), statsYearTotal(source.records, config.classroomYear, "M")); const families = buildSpellingFamiliesGeneric(input.familiesCsv, source.records, config, coverage.endYear).families;
  const profile: DecadeProfile = { decade: config.startYear, startYear: config.startYear, endYear: coverage.endYear, nominalEndYear: config.nominalEndYear, dataThroughYear: source.maxYear, isComplete: coverage.isComplete, totalBirths: diversity.totalBirths, femaleBirths: diversity.femaleBirths, maleBirths: diversity.maleBirths, distinctNames: diversity.distinctNames, top10Share: diversity.top10Share, top100Share: diversity.top100Share, diversityScore: diversity.diversityScore, effectiveNames: diversity.effectiveNames, concentrationScore: diversity.concentrationScore, femaleChampion: championOf(ownership.female), maleChampion: championOf(ownership.male), ownershipRankings: { female: ownership.female, male: ownership.male, mostOwned: views.mostOwned, mostPopular: views.mostPopular, popularButTimeless: views.popularButTimeless, unexpected: views.unexpected }, alpha: config.alpha, priorDecadeShare: ownership.priorDecadeSharePooled, priorDecadeShareFemale: ownership.priorDecadeShareFemale, priorDecadeShareMale: ownership.priorDecadeShareMale, classroomDefaults: classroom, spellingFamilies: families, methodologyVersion: DECADE_HUB_METHODOLOGY_VERSION, generatedAt: input.generatedAt, sourceVersion: input.sourceVersion };
  if (input.gitCommit !== undefined) profile.gitCommit = input.gitCommit; return profile;
}
function statsYearTotal(records: SourceNameRecord[], year: number, sex: Sex): number { return records.filter((rec) => rec.sex === sex).reduce((sum, rec) => sum + (rec.series[year] ?? 0), 0); }

export type AnchorReport = Record<string, number>;
export function evaluateSanityAnchors(source: DecadeHubSource, config: DecadeComputeConfig): AnchorReport {
  const coverage = computeDecadeCoverage(source, config); const report: AnchorReport = {}; const totalAt = (year: number) => source.records.reduce((sum, rec) => sum + (rec.series[year] ?? 0), 0); const find = (name: string, sex: Sex) => source.records.find((rec) => rec.name === name && rec.sex === sex);
  for (const anchor of config.sanityAnchors) {
    if (anchor.kind === "year-total") { if (anchor.year < coverage.startYear || anchor.year > coverage.endYear) throw new Error(`sanity anchor year ${anchor.year} is outside actual coverage ${coverage.startYear}–${coverage.endYear}`); const value = totalAt(anchor.year); report[`yearTotal${anchor.year}`] = value; if (value < anchor.min || value > anchor.max) throw new Error(`sanity anchor failed: ${anchor.year} total births ${value} outside ${anchor.min}–${anchor.max}`); }
    else if (anchor.kind === "record-year-count") { const value = find(anchor.name, anchor.sex)?.series[anchor.year] ?? 0; report[`${anchor.name}${anchor.sex}${anchor.year}`] = value; if (value < anchor.min || value > anchor.max) throw new Error(`sanity anchor failed: ${anchor.name} (${anchor.sex}) ${anchor.year} = ${value}, expected ${anchor.min}–${anchor.max}`); }
    else if (anchor.kind === "record-decade-count") { const value = source.records.filter((rec) => rec.name === anchor.name && rec.sex === anchor.sex).reduce((sum, rec) => { for (let year = coverage.startYear; year <= coverage.endYear; year++) sum += rec.series[year] ?? 0; return sum; }, 0); report[`${anchor.name}${anchor.sex}${config.startYear}s`] = value; if (value < anchor.min || (anchor.max !== undefined && value > anchor.max)) throw new Error(`sanity anchor failed: ${anchor.name} (${anchor.sex}) ${config.startYear}s = ${value}`); }
    else { const value = source.records.reduce((sum, rec) => { for (let year = coverage.startYear; year <= coverage.endYear; year++) sum += rec.series[year] ?? 0; return sum; }, 0); report[`minimumDecadeTotal${config.startYear}`] = value; if (value < anchor.min) throw new Error(`sanity anchor failed: ${config.startYear}s total ${value} is below ${anchor.min}`); }
  }
  return report;
}
function sortKeysDeep(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortKeysDeep); if (value !== null && typeof value === "object") { const out: Record<string, unknown> = {}; for (const key of Object.keys(value as Record<string, unknown>).sort()) out[key] = sortKeysDeep((value as Record<string, unknown>)[key]); return out; } return value; }
export function stableStringify(value: unknown, pretty = false): string { return JSON.stringify(sortKeysDeep(value), null, pretty ? 2 : 0); }
