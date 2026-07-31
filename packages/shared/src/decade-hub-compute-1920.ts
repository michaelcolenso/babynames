// Pure compute functions for the 1920s decade hub (SPEC §3–§6).
// No I/O in this module — callers load source data and pass plain records in.
// Everything here is deterministic: all sort orders carry explicit tie-breaks
// (higher birthsInDecade, then alphabetical by name_lower) and no wall-clock
// reads; `generatedAt` is supplied by the caller.

import { classify } from "./classify";
import type {
  ClassroomResult,
  ClassroomStudent,
  DecadeProfile,
  NameSummary,
  OwnershipResult,
  SpellingFamilyResult,
  SpellingFamilyYearPoint,
} from "./decade-hub-types";
import { DECADE_HUB_METHODOLOGY_VERSION } from "./decade-hub-types";

export const DECADE_START = 1920;
export const DECADE_END = 1929;
export const CLASSROOM_YEAR = 1924;
export const CLASSROOM_SIZE = 30;
export const ELIGIBILITY_MIN_BIRTHS = 5000;
export const ELIGIBILITY_TOP1000_MIN_YEARS = 5;
export const OWNERSHIP_WEIGHT_CONCENTRATION = 0.7;
export const OWNERSHIP_WEIGHT_PROMINENCE = 0.3;
export const FAMILY_MIN_VARIANT_BIRTHS = 1000;
export const FAMILY_MIN_TOTAL_BIRTHS = 20000;
export const FAMILY_MIN_VARIANTS = 2;

// Chosen via scripts/decade-hub-sensitivity.ts (smallest alpha with zero
// low-volume intrusions in the pooled top-25): alpha=500 admits 5 intrusions,
// alpha=1000 admits 4 (tiny male spellings of popular female names, e.g.
// Jessica M), alpha=2500 admits 0 while preserving intuitive ordering of
// substantial names. See data/dist/decade-hub-sensitivity.md.
export const DECADE_HUB_ALPHA = 2500;

export type Sex = "F" | "M";

/** One (name, sex) source row: sparse yearly series (only years with count >= 5 present). */
export interface SourceNameRecord {
  name: string;
  sex: Sex;
  series: Record<number, number>;
}

export interface DecadeHubSource {
  minYear: number;
  maxYear: number;
  records: SourceNameRecord[];
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function nameKey(sex: Sex, name: string): string {
  return sex + "|" + name.toLowerCase();
}

/** Deterministic comparator: higher birthsInDecade first, then alphabetical by name_lower. */
export function compareByBirths(a: { birthsInDecade: number; name: string }, b: { birthsInDecade: number; name: string }): number {
  if (b.birthsInDecade !== a.birthsInDecade) return b.birthsInDecade - a.birthsInDecade;
  const al = a.name.toLowerCase();
  const bl = b.name.toLowerCase();
  return al < bl ? -1 : al > bl ? 1 : 0;
}

/** Nearest-rank percentile over ascending-sorted values. p in [0,1]. Deterministic. */
export function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) throw new Error("percentile of empty set");
  const idx = Math.floor(p * (sortedAsc.length - 1));
  return sortedAsc[idx]!;
}

export function median(sortedAsc: number[]): number {
  return percentile(sortedAsc, 0.5);
}

// ---------------------------------------------------------------------------
// per-record stats
// ---------------------------------------------------------------------------

export interface NameDecadeStats {
  name: string;
  slug: string;
  sex: Sex;
  birthsInDecade: number;
  lifetimeBirths: number;
  firstYear: number;
  lastYear: number;
  peakYear: number;
  peakCount: number;
  rankedYearsInDecade: number; // years DECADE_START..DECADE_END with count >= 1
  status: string;
  yearlyInDecade: Record<number, number>; // only years with count >= 1
}

/**
 * Summarize one source record for the decade window. `lifetimeBirths` spans the
 * full source range (through dataThroughYear). Status reuses the repo's
 * classify() so hub rows agree with name dossiers.
 */
export function summarizeRecord(rec: SourceNameRecord, dataThroughYear: number): NameDecadeStats {
  let lifetimeBirths = 0;
  let birthsInDecade = 0;
  let rankedYearsInDecade = 0;
  const yearlyInDecade: Record<number, number> = {};
  for (const [yearStr, count] of Object.entries(rec.series)) {
    const year = Number(yearStr);
    if (count <= 0) continue;
    lifetimeBirths += count;
    if (year >= DECADE_START && year <= DECADE_END) {
      birthsInDecade += count;
      rankedYearsInDecade += 1;
      yearlyInDecade[year] = count;
    }
  }
  const c = classify({ series: rec.series, yM: dataThroughYear });
  return {
    name: rec.name,
    slug: rec.name, // repo convention: /name/<Name>/ links use canonical display casing
    sex: rec.sex,
    birthsInDecade,
    lifetimeBirths,
    firstYear: c?.firstYear ?? 0,
    lastYear: c?.lastYear ?? 0,
    peakYear: c?.peakYear ?? 0,
    peakCount: c?.peakCount ?? 0,
    rankedYearsInDecade,
    status: c?.status ?? "unknown",
    yearlyInDecade,
  };
}

// ---------------------------------------------------------------------------
// yearly ranks + eligibility (SPEC §3)
// ---------------------------------------------------------------------------

/**
 * For each (sex, year) in the decade, rank every present name by count desc
 * (ties: alphabetical by name_lower) and count, per name, in how many distinct
 * years it reached the top 1000. Returns map `${sex}|${name_lower}` -> years.
 */
export function computeTop1000Years(records: SourceNameRecord[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const sex of ["F", "M"] as const) {
    for (let year = DECADE_START; year <= DECADE_END; year++) {
      const present: { name: string; count: number }[] = [];
      for (const rec of records) {
        if (rec.sex !== sex) continue;
        const count = rec.series[year] ?? 0;
        if (count >= 1) present.push({ name: rec.name, count });
      }
      present.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        const al = a.name.toLowerCase();
        const bl = b.name.toLowerCase();
        return al < bl ? -1 : al > bl ? 1 : 0;
      });
      const limit = Math.min(1000, present.length);
      for (let i = 0; i < limit; i++) {
        const key = nameKey(sex, present[i]!.name);
        result.set(key, (result.get(key) ?? 0) + 1);
      }
    }
  }
  return result;
}

/** SPEC §3: birthsInDecade >= 5000 OR top-1000 rank by sex in >= 5 distinct years of the decade. */
export function isEligible(stats: NameDecadeStats, top1000Years: Map<string, number>): boolean {
  if (stats.birthsInDecade >= ELIGIBILITY_MIN_BIRTHS) return true;
  return (top1000Years.get(nameKey(stats.sex, stats.name)) ?? 0) >= ELIGIBILITY_TOP1000_MIN_YEARS;
}

// ---------------------------------------------------------------------------
// ownership scoring (SPEC §3)
// ---------------------------------------------------------------------------

export interface OwnershipComputation {
  female: OwnershipResult[];
  male: OwnershipResult[];
  priorDecadeShareFemale: number;
  priorDecadeShareMale: number;
  /** Pooled prior across both sex sets (stored on the profile; scoring uses the per-sex priors). */
  priorDecadeSharePooled: number;
}

interface WorkingRow extends NameDecadeStats {
  adjusted: number;
  rawProminence: number;
}

function rankSexSet(eligible: NameDecadeStats[], alpha: number): { rows: OwnershipResult[]; prior: number } {
  let sumDecade = 0;
  let sumLifetime = 0;
  for (const e of eligible) {
    sumDecade += e.birthsInDecade;
    sumLifetime += e.lifetimeBirths;
  }
  // prior_decade_share for this sex's eligible set (SPEC §3: computed PER SEX).
  const prior = sumLifetime > 0 ? sumDecade / sumLifetime : 0;

  const working: WorkingRow[] = eligible.map((e) => ({
    ...e,
    adjusted: (e.birthsInDecade + alpha * prior) / (e.lifetimeBirths + alpha),
    rawProminence: Math.log(1 + e.birthsInDecade),
  }));

  let minAdj = Infinity;
  let maxAdj = -Infinity;
  let minProm = Infinity;
  let maxProm = -Infinity;
  for (const w of working) {
    minAdj = Math.min(minAdj, w.adjusted);
    maxAdj = Math.max(maxAdj, w.adjusted);
    minProm = Math.min(minProm, w.rawProminence);
    maxProm = Math.max(maxProm, w.rawProminence);
  }
  const adjSpan = maxAdj - minAdj;
  const promSpan = maxProm - minProm;

  const rows: OwnershipResult[] = working.map((w) => {
    const normConc = adjSpan > 0 ? (w.adjusted - minAdj) / adjSpan : 0;
    const normProm = promSpan > 0 ? (w.rawProminence - minProm) / promSpan : 0;
    const score = 100 * (OWNERSHIP_WEIGHT_CONCENTRATION * normConc + OWNERSHIP_WEIGHT_PROMINENCE * normProm);
    return {
      name: w.name,
      slug: w.slug,
      sex: w.sex,
      birthsInDecade: w.birthsInDecade,
      lifetimeBirths: w.lifetimeBirths,
      ownershipRank: 0, // assigned below
      ownershipScore: round4(score),
      popularityRank: 0, // assigned below
      rankedYearsInDecade: w.rankedYearsInDecade,
      decadeShare: round6(w.lifetimeBirths > 0 ? w.birthsInDecade / w.lifetimeBirths : 0),
      adjustedConcentration: round6(w.adjusted),
      normalizedConcentration: round6(normConc),
      normalizedProminence: round6(normProm),
      peakYear: w.peakYear,
      peakCount: w.peakCount,
      firstYear: w.firstYear,
      lastYear: w.lastYear,
      status: w.status,
    };
  });

  // ownershipRank: score desc; ties -> higher birthsInDecade, then name_lower.
  const byScore = [...rows].sort((a, b) => {
    if (b.ownershipScore !== a.ownershipScore) return b.ownershipScore - a.ownershipScore;
    return compareByBirths(a, b);
  });
  byScore.forEach((row, i) => {
    row.ownershipRank = i + 1;
  });
  // popularityRank: birthsInDecade desc; ties -> name_lower.
  const byPop = [...rows].sort(compareByBirths);
  byPop.forEach((row, i) => {
    row.popularityRank = i + 1;
  });

  // final array: ownershipScore desc (ties as above) — the "full eligible set" view.
  return { rows: byScore, prior };
}

/** Score the female and male eligible sets independently (sex separation end-to-end). */
export function computeOwnership(
  stats: NameDecadeStats[],
  top1000Years: Map<string, number>,
  alpha: number,
): OwnershipComputation {
  const eligibleF = stats.filter((s) => s.sex === "F" && isEligible(s, top1000Years));
  const eligibleM = stats.filter((s) => s.sex === "M" && isEligible(s, top1000Years));
  const f = rankSexSet(eligibleF, alpha);
  const m = rankSexSet(eligibleM, alpha);
  let sumDecade = 0;
  let sumLifetime = 0;
  for (const e of [...eligibleF, ...eligibleM]) {
    sumDecade += e.birthsInDecade;
    sumLifetime += e.lifetimeBirths;
  }
  return {
    female: f.rows,
    male: m.rows,
    priorDecadeShareFemale: round6(f.prior),
    priorDecadeShareMale: round6(m.prior),
    priorDecadeSharePooled: round6(sumLifetime > 0 ? sumDecade / sumLifetime : 0),
  };
}

export interface OwnershipViews {
  mostOwned: OwnershipResult[];
  mostPopular: OwnershipResult[];
  popularButTimeless: OwnershipResult[];
  unexpected: OwnershipResult[];
}

/** Deterministic cross-sex ranking views (SPEC §3 "Ranking views"). */
export function computeOwnershipViews(female: OwnershipResult[], male: OwnershipResult[]): OwnershipViews {
  const pooled = [...female, ...male];

  const mostOwned = [...pooled]
    .sort((a, b) => {
      if (b.ownershipScore !== a.ownershipScore) return b.ownershipScore - a.ownershipScore;
      return compareByBirths(a, b);
    })
    .slice(0, 25);

  const mostPopular = [...pooled].sort(compareByBirths).slice(0, 25);

  // Popular but Timeless: birthsInDecade >= median of the pooled eligible set AND
  // adjustedConcentration <= 25th percentile of the pooled eligible set;
  // sort birthsInDecade desc; top 25.
  const birthsAsc = pooled.map((r) => r.birthsInDecade).sort((a, b) => a - b);
  const concAsc = pooled.map((r) => r.adjustedConcentration).sort((a, b) => a - b);
  const medianBirths = median(birthsAsc);
  const p25Conc = percentile(concAsc, 0.25);
  const popularButTimeless = pooled
    .filter((r) => r.birthsInDecade >= medianBirths && r.adjustedConcentration <= p25Conc)
    .sort(compareByBirths)
    .slice(0, 25);

  // Unexpected Results: (popularityRank - ownershipRank) >= 20 within a sex set;
  // sort by that delta desc (ties: birthsInDecade desc, then name_lower); top 25.
  const unexpected = pooled
    .map((r) => ({ row: r, delta: r.popularityRank - r.ownershipRank }))
    .filter((x) => x.delta >= 20)
    .sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      return compareByBirths(a.row, b.row);
    })
    .slice(0, 25)
    .map((x) => x.row);

  return { mostOwned, mostPopular, popularButTimeless, unexpected };
}

// ---------------------------------------------------------------------------
// diversity & concentration (SPEC §4) — pooled name+sex rows
// ---------------------------------------------------------------------------

export interface DiversityMetrics {
  totalBirths: number;
  femaleBirths: number;
  maleBirths: number;
  distinctNames: number;
  top10Share: number;
  top100Share: number;
  diversityScore: number;
  effectiveNames: number;
  concentrationScore: number;
}

export function computeDiversityMetrics(stats: NameDecadeStats[]): DiversityMetrics {
  const present = stats.filter((s) => s.birthsInDecade > 0);
  let totalBirths = 0;
  let femaleBirths = 0;
  let maleBirths = 0;
  for (const s of present) {
    totalBirths += s.birthsInDecade;
    if (s.sex === "F") femaleBirths += s.birthsInDecade;
    else maleBirths += s.birthsInDecade;
  }
  const n = present.length;
  if (totalBirths <= 0 || n === 0) throw new Error("no decade births in source data");

  // p_i = births of name_i / total births (pooled across sexes, name+sex rows).
  let h = 0;
  let hhi = 0;
  for (const s of present) {
    const p = s.birthsInDecade / totalBirths;
    h -= p * Math.log(p);
    hhi += p * p;
  }
  const sorted = [...present].sort(compareByBirths);
  const shareOf = (k: number) => sorted.slice(0, k).reduce((acc, s) => acc + s.birthsInDecade, 0) / totalBirths;

  return {
    totalBirths,
    femaleBirths,
    maleBirths,
    distinctNames: n,
    top10Share: round6(shareOf(10)),
    top100Share: round6(shareOf(100)),
    // normalized Shannon entropy: 100 × H / ln(N_distinct)
    diversityScore: round4(100 * (h / Math.log(n))),
    // N_eff = exp(H)
    effectiveNames: Math.round(Math.exp(h) * 100) / 100,
    // 10000-normalized HHI mapped to 0–100: 100 × (HHI − 1/N)/(1 − 1/N)
    concentrationScore: round4(100 * ((hhi - 1 / n) / (1 - 1 / n))),
  };
}

// ---------------------------------------------------------------------------
// classroom apportionment (SPEC §5)
// ---------------------------------------------------------------------------

/**
 * Deterministic 30-student national classroom for CLASSROOM_YEAR.
 * Sex split from the actual year totals; per sex, expected_seats_i =
 * count_i/sex_total × sexSeats; floor each; remaining seats by largest
 * remainder (ties: higher count, then alphabetical). Duplicates are allowed by
 * construction — on real 1924 data no name reaches a full expected seat
 * (Michael's expected seats ≈ 0.60), so the real roster is all-unique; that is
 * a documented property of the 1924 distribution, not a uniqueness constraint.
 */
export function apportionClassroom(
  records: SourceNameRecord[],
  year: number,
  size: number,
  femaleTotal: number,
  maleTotal: number,
): ClassroomResult {
  if (year !== CLASSROOM_YEAR || size !== CLASSROOM_SIZE) {
    throw new Error(`v1 classroom is fixed at ${CLASSROOM_YEAR}/${CLASSROOM_SIZE} seats`);
  }
  const femaleSeats = Math.round((size * femaleTotal) / (femaleTotal + maleTotal));
  const maleSeats = size - femaleSeats;

  const students: ClassroomStudent[] = [];
  const seatTable = new Map<string, ClassroomStudent>(); // key: sex|name_lower

  for (const sex of ["F", "M"] as const) {
    const sexSeats = sex === "F" ? femaleSeats : maleSeats;
    const sexTotal = sex === "F" ? femaleTotal : maleTotal;
    const pool: { name: string; count: number; expected: number; floor: number; remainder: number }[] = [];
    for (const rec of records) {
      if (rec.sex !== sex) continue;
      const count = rec.series[year] ?? 0;
      if (count < 1) continue;
      const expected = (count / sexTotal) * sexSeats;
      const fl = Math.floor(expected);
      pool.push({ name: rec.name, count, expected, floor: fl, remainder: expected - fl });
    }
    let assigned = pool.reduce((acc, p) => acc + p.floor, 0);
    let remaining = sexSeats - assigned;
    if (remaining < 0) throw new Error("floor apportionment overshot the seat count");
    // largest remainder; ties -> higher count, then alphabetical by name_lower
    const byRemainder = [...pool].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      if (b.count !== a.count) return b.count - a.count;
      const al = a.name.toLowerCase();
      const bl = b.name.toLowerCase();
      return al < bl ? -1 : al > bl ? 1 : 0;
    });
    const bonus = new Set<string>();
    for (let i = 0; i < remaining && i < byRemainder.length; i++) {
      bonus.add(byRemainder[i]!.name.toLowerCase());
    }
    remaining -= Math.min(remaining, byRemainder.length);
    // Pathological rounding fallback: adjust the alphabetically FIRST max-remainder name.
    if (remaining > 0 && byRemainder.length > 0) {
      const first = byRemainder[0]!;
      const key = nameKey(sex, first.name);
      const existing = seatTable.get(key);
      if (existing) existing.seats += remaining;
      else seatTable.set(key, { name: first.name, slug: first.name, sex, seats: first.floor + 1 + remaining });
      remaining = 0;
    }
    for (const p of pool) {
      const seats = p.floor + (bonus.has(p.name.toLowerCase()) ? 1 : 0);
      if (seats < 1) continue;
      const key = nameKey(sex, p.name);
      const existing = seatTable.get(key);
      if (existing) existing.seats += seats;
      else seatTable.set(key, { name: p.name, slug: p.name, sex, seats });
    }
  }

  // Roster order: seats desc, then alphabetical by name_lower (sex as final tie-break).
  const ordered = [...seatTable.values()].sort((a, b) => {
    if (b.seats !== a.seats) return b.seats - a.seats;
    const al = a.name.toLowerCase();
    const bl = b.name.toLowerCase();
    if (al !== bl) return al < bl ? -1 : 1;
    return a.sex < b.sex ? -1 : a.sex > b.sex ? 1 : 0;
  });
  for (const entry of ordered) {
    for (let i = 0; i < entry.seats; i++) {
      students.push({ name: entry.name, slug: entry.slug, sex: entry.sex, seats: entry.seats });
    }
  }
  if (students.length !== size) {
    throw new Error(`classroom produced ${students.length} students, expected ${size}`);
  }

  const uniqueNames = ordered.length;
  // mostRepeated is always well-defined (the roster is non-empty at size 30):
  // in the all-unique case it is the first name in deterministic roster order
  // with seats = 1.
  const mostRepeated = ordered[0]!;
  return {
    year: CLASSROOM_YEAR,
    size: CLASSROOM_SIZE,
    femaleSeats,
    maleSeats,
    students,
    uniqueNames,
    repeatedNames: size - uniqueNames,
    mostRepeated: { name: mostRepeated.name, slug: mostRepeated.slug, seats: mostRepeated.seats },
    topShare: round4(mostRepeated.seats / size),
  };
}

// ---------------------------------------------------------------------------
// spelling families (SPEC §6) — CSV is the single source; no clustering
// ---------------------------------------------------------------------------

export interface SpellingFamilyCsvRow {
  familyId: string;
  label: string;
  canonical: string;
  variant: string;
  reviewStatus: string;
  rationale: string;
}

/** Minimal RFC-4180-ish CSV parser (quoted fields, doubled quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function parseSpellingFamiliesCsv(text: string): SpellingFamilyCsvRow[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0]!.map((h) => h.trim());
  const expected = ["family_id", "label", "canonical", "variant", "review_status", "rationale"];
  if (expected.some((e, i) => header[i] !== e)) {
    throw new Error(`spelling-families.csv header must be ${expected.join(",")}`);
  }
  return rows.slice(1).map((r) => ({
    familyId: r[0]!.trim(),
    label: r[1]!.trim(),
    canonical: r[2]!.trim(),
    variant: r[3]!.trim(),
    reviewStatus: r[4]!.trim(),
    rationale: r[5]!.trim(),
  }));
}

export interface FamilyBuildResult {
  families: SpellingFamilyResult[];
  skipped: { familyId: string; reason: string }[];
}

/**
 * Aggregate approved CSV families against the real source data.
 * A family ships only with >= FAMILY_MIN_VARIANTS approved variants each with
 * >= FAMILY_MIN_VARIANT_BIRTHS decade births and combined >= FAMILY_MIN_TOTAL_BIRTHS.
 * Sex table: the dominant sex of the canonical variant (all variant stats and
 * ranks are computed in that per-sex decade table).
 */
export function buildSpellingFamilies(csvText: string, records: SourceNameRecord[]): FamilyBuildResult {
  const rows = parseSpellingFamiliesCsv(csvText).filter((r) => r.reviewStatus === "approved");

  // Per-sex decade rank tables (ties: name_lower), for variant + combined ranks.
  const rankTables = new Map<Sex, Map<string, number>>();
  const decadeBirths = new Map<string, number>(); // `${sex}|${name_lower}` -> birthsInDecade
  const bySexName = new Map<string, SourceNameRecord>();
  for (const rec of records) {
    bySexName.set(nameKey(rec.sex, rec.name), rec);
    let b = 0;
    for (let y = DECADE_START; y <= DECADE_END; y++) b += rec.series[y] ?? 0;
    decadeBirths.set(nameKey(rec.sex, rec.name), b);
  }
  for (const sex of ["F", "M"] as const) {
    const entries = records
      .filter((r) => r.sex === sex)
      .map((r) => ({ name: r.name, birthsInDecade: decadeBirths.get(nameKey(sex, r.name)) ?? 0 }))
      .filter((e) => e.birthsInDecade > 0)
      .sort(compareByBirths);
    const table = new Map<string, number>();
    entries.forEach((e, i) => table.set(e.name.toLowerCase(), i + 1));
    rankTables.set(sex, table);
  }

  const byFamily = new Map<string, SpellingFamilyCsvRow[]>();
  for (const r of rows) {
    const list = byFamily.get(r.familyId) ?? [];
    list.push(r);
    byFamily.set(r.familyId, list);
  }

  const families: SpellingFamilyResult[] = [];
  const skipped: { familyId: string; reason: string }[] = [];

  for (const familyId of [...byFamily.keys()].sort()) {
    const group = byFamily.get(familyId)!;
    const label = group[0]!.label;
    const canonical = group[0]!.canonical;
    const rationale = group[0]!.rationale;

    // de-dupe variants within the family (keep first occurrence order)
    const variantNames: string[] = [];
    const seen = new Set<string>();
    for (const r of group) {
      const key = r.variant.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        variantNames.push(r.variant);
      }
    }

    // family sex table = dominant sex of the canonical variant
    const canonF = decadeBirths.get(nameKey("F", canonical)) ?? 0;
    const canonM = decadeBirths.get(nameKey("M", canonical)) ?? 0;
    const sex: Sex = canonF >= canonM ? "F" : "M";
    const table = rankTables.get(sex)!;
    const sexBirthCounts = [...decadeBirths.entries()]
      .filter(([k]) => k.startsWith(sex + "|"))
      .map(([, v]) => v)
      .filter((v) => v > 0);

    const variants: SpellingFamilyResult["variants"] = [];
    const yearlyByVariant = new Map<string, Record<number, number>>();
    let total = 0;
    let fail: string | null = null;
    for (const v of variantNames) {
      const rec = bySexName.get(nameKey(sex, v));
      const births = decadeBirths.get(nameKey(sex, v)) ?? 0;
      if (!rec || births < FAMILY_MIN_VARIANT_BIRTHS) {
        fail = `variant ${v} has ${births} ${sex} births in decade (< ${FAMILY_MIN_VARIANT_BIRTHS})`;
        break;
      }
      total += births;
      const yearly: Record<number, number> = {};
      for (let y = DECADE_START; y <= DECADE_END; y++) yearly[y] = rec.series[y] ?? 0;
      yearlyByVariant.set(v, yearly);
      variants.push({
        name: v,
        slug: v,
        birthsInDecade: births,
        decadeRank: table.get(v.toLowerCase()) ?? null,
        shareOfFamily: 0, // filled after total known
      });
    }
    if (fail) {
      skipped.push({ familyId, reason: fail });
      continue;
    }
    if (variants.length < FAMILY_MIN_VARIANTS) {
      skipped.push({ familyId, reason: `only ${variants.length} qualifying variants (< ${FAMILY_MIN_VARIANTS})` });
      continue;
    }
    if (total < FAMILY_MIN_TOTAL_BIRTHS) {
      skipped.push({ familyId, reason: `combined ${total} births (< ${FAMILY_MIN_TOTAL_BIRTHS})` });
      continue;
    }
    for (const v of variants) v.shareOfFamily = round6(v.birthsInDecade / total);

    const dominant = [...variants].sort(compareByBirths)[0]!.name;

    // yearly series: per-variant + total, 10 points
    const yearlyPoints: SpellingFamilyYearPoint[] = [];
    for (let y = DECADE_START; y <= DECADE_END; y++) {
      const point: SpellingFamilyYearPoint = { year: y, total: 0 };
      for (const v of variantNames) {
        const c = yearlyByVariant.get(v)![y] ?? 0;
        point[v] = c;
        point.total += c;
      }
      yearlyPoints.push(point);
    }
    let peakYear = DECADE_START;
    let peakTotal = -1;
    for (const p of yearlyPoints) {
      if (p.total > peakTotal) {
        peakTotal = p.total;
        peakYear = p.year;
      }
    }

    // combinedDecadeRank: position the family total WOULD have in this sex's
    // decade table = 1 + count of names with strictly more decade births.
    let combinedRank = 1;
    for (const b of sexBirthCounts) if (b > total) combinedRank++;

    families.push({
      id: familyId,
      label,
      canonicalDisplayName: canonical,
      variants,
      totalBirthsInDecade: total,
      combinedDecadeRank: combinedRank,
      dominantVariant: dominant,
      peakYear,
      yearly: yearlyPoints,
      rationale,
      reviewStatus: "approved",
    });
  }

  families.sort((a, b) => b.totalBirthsInDecade - a.totalBirthsInDecade || (a.id < b.id ? -1 : 1));
  return { families, skipped };
}

// ---------------------------------------------------------------------------
// champions + full profile assembly
// ---------------------------------------------------------------------------

function championOf(rows: OwnershipResult[]): NameSummary {
  const top = [...rows].sort(compareByBirths)[0]!;
  return {
    name: top.name,
    slug: top.slug,
    sex: top.sex,
    birthsInDecade: top.birthsInDecade,
    lifetimeBirths: top.lifetimeBirths,
  };
}

export interface BuildProfileInput {
  source: DecadeHubSource;
  alpha: number;
  familiesCsv: string;
  generatedAt: string;
  sourceVersion: string;
  gitCommit?: string;
}

/**
 * Assemble the full DecadeProfile from source records. Pure and deterministic
 * for fixed inputs (generatedAt is caller-supplied and excluded from the
 * determinism check).
 */
export function buildDecadeProfile(input: BuildProfileInput): DecadeProfile {
  const { source, alpha } = input;
  const dataThroughYear = source.maxYear;
  const stats = source.records.map((r) => summarizeRecord(r, dataThroughYear));
  const top1000 = computeTop1000Years(source.records);
  const ownership = computeOwnership(stats, top1000, alpha);
  const views = computeOwnershipViews(ownership.female, ownership.male);
  const diversity = computeDiversityMetrics(stats);
  const classroom = apportionClassroom(
    source.records,
    CLASSROOM_YEAR,
    CLASSROOM_SIZE,
    statsYearTotal(source.records, CLASSROOM_YEAR, "F"),
    statsYearTotal(source.records, CLASSROOM_YEAR, "M"),
  );
  const { families } = buildSpellingFamilies(input.familiesCsv, source.records);

  const profile: DecadeProfile = {
    decade: 1920,
    startYear: DECADE_START,
    endYear: DECADE_END,
    dataThroughYear,
    isComplete: true,
    totalBirths: diversity.totalBirths,
    femaleBirths: diversity.femaleBirths,
    maleBirths: diversity.maleBirths,
    distinctNames: diversity.distinctNames,
    top10Share: diversity.top10Share,
    top100Share: diversity.top100Share,
    diversityScore: diversity.diversityScore,
    effectiveNames: diversity.effectiveNames,
    concentrationScore: diversity.concentrationScore,
    femaleChampion: championOf(ownership.female),
    maleChampion: championOf(ownership.male),
    ownershipRankings: {
      female: ownership.female,
      male: ownership.male,
      mostOwned: views.mostOwned,
      mostPopular: views.mostPopular,
      popularButTimeless: views.popularButTimeless,
      unexpected: views.unexpected,
    },
    alpha,
    // Scoring uses PER-SEX priors (SPEC §3). `priorDecadeShare` keeps the pooled
    // eligible-set prior for transparency; the two per-sex priors actually used
    // are exposed alongside it.
    priorDecadeShare: ownership.priorDecadeSharePooled,
    priorDecadeShareFemale: ownership.priorDecadeShareFemale,
    priorDecadeShareMale: ownership.priorDecadeShareMale,
    classroomDefaults: classroom,
    spellingFamilies: families,
    methodologyVersion: DECADE_HUB_METHODOLOGY_VERSION,
    generatedAt: input.generatedAt,
    sourceVersion: input.sourceVersion,
  };
  if (input.gitCommit !== undefined) profile.gitCommit = input.gitCommit;
  return profile;
}

function statsYearTotal(records: SourceNameRecord[], year: number, sex: Sex): number {
  let total = 0;
  for (const rec of records) {
    if (rec.sex !== sex) continue;
    total += rec.series[year] ?? 0;
  }
  return total;
}

// ---------------------------------------------------------------------------
// sanity anchors (SPEC §1) — the build MUST assert these before writing output
// ---------------------------------------------------------------------------

export interface AnchorReport {
  totalBirths1924: number;
}

/** Verify that the classroom year and full decade contain plausible SSA totals. */
export function assertSanityAnchors(source: DecadeHubSource): AnchorReport {
  const totalBirths1924 = source.records.reduce((sum, rec) => sum + (rec.series[CLASSROOM_YEAR] ?? 0), 0);
  if (totalBirths1924 < 1_500_000 || totalBirths1924 > 3_500_000) {
    throw new Error(`sanity anchor failed: 1924 total births ${totalBirths1924} outside 1.5M–3.5M`);
  }
  const decadeTotal = source.records.reduce((sum, rec) => {
    for (let year = DECADE_START; year <= DECADE_END; year++) sum += rec.series[year] ?? 0;
    return sum;
  }, 0);
  if (decadeTotal < 15_000_000) throw new Error(`sanity anchor failed: 1920s total ${decadeTotal} is implausibly low`);
  return { totalBirths1924 };
}

// ---------------------------------------------------------------------------
// deterministic JSON serialization (SPEC §1: sort all keys before stringify)
// ---------------------------------------------------------------------------

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortKeysDeep(obj[key]);
    return out;
  }
  return value;
}

/** Byte-deterministic JSON: recursively sorted keys. `pretty` adds 2-space indent. */
export function stableStringify(value: unknown, pretty = false): string {
  return JSON.stringify(sortKeysDeep(value), null, pretty ? 2 : 0);
}
