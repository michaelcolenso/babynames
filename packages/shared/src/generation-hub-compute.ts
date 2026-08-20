// Request-time computation for the generation hubs.
//
// Unlike the decade hubs (whose ownership profiles are precomputed offline and
// seeded into D1), generation windows cross calendar decades and are not
// precomputed anywhere. This module derives everything from the same annual
// SSA tables the rest of the product reads (name_years, year_totals, names),
// so no generation-specific table, seed, or D1 mutation is involved. The
// result is deterministic: the same data always produces the same profile.

import type { D1Database } from "@cloudflare/workers-types";
import { getMeta, topNamesInYearRange, yearRangeTotals, type YearRangeNameRow } from "./d1-queries";
import {
  getGenerationDefinition,
  type GenerationDefinition,
} from "./content/generation-definitions";

/** meta key holding the latest year present in the SSA data. */
const MAX_YEAR_KEY = "max_year";

/** A name row ranked inside a generation window. */
export interface GenerationNameRow {
  name: string;
  sex: "F" | "M";
  /** 1-based rank by recorded births inside the window, within the sex. */
  rank: number;
  /** Recorded births inside the window. */
  windowTotal: number;
  /** Recorded births across the whole SSA span (1880–dataThroughYear). */
  lifetimeTotal: number;
  /** windowTotal / lifetimeTotal — how concentrated the name's history is in this window. */
  windowShare: number;
}

export interface GenerationComparison {
  label: string;
  startYear: number;
  endYear: number;
  femaleChampion?: GenerationNameRow;
  maleChampion?: GenerationNameRow;
}

export interface GenerationProfile {
  slug: string;
  label: string;
  seoLabel: string;
  startYear: number;
  endYear: number;
  /** min(endYear, dataThroughYear) — the last year actually observed. */
  observedEnd: number;
  isComplete: boolean;
  dataThroughYear: number;
  totalBirths: number;
  femaleBirths: number;
  maleBirths: number;
  girls: GenerationNameRow[];
  boys: GenerationNameRow[];
  femaleChampion: GenerationNameRow;
  maleChampion: GenerationNameRow;
  /** Top 3 per sex by windowShare among rows with >= 5,000 lifetime births. */
  signatureGirls: GenerationNameRow[];
  signatureBoys: GenerationNameRow[];
  previous?: GenerationComparison;
}

/** Names with fewer lifetime births than this are excluded from signature picks. */
export const SIGNATURE_LIFETIME_FLOOR = 5_000;
export const SIGNATURE_PER_SEX = 3;
export const GENERATION_HUB_ROWS_PER_SEX = 25;

function toRows(rows: YearRangeNameRow[]): GenerationNameRow[] {
  return rows.map((row) => ({
    name: row.name,
    sex: row.sex,
    rank: row.rank,
    windowTotal: row.window_total,
    lifetimeTotal: row.lifetime_total,
    windowShare: row.lifetime_total > 0 ? row.window_total / row.lifetime_total : 0,
  }));
}

function champions(rows: GenerationNameRow[]): { female?: GenerationNameRow; male?: GenerationNameRow } {
  const female = rows.find((row) => row.sex === "F" && row.rank === 1);
  const male = rows.find((row) => row.sex === "M" && row.rank === 1);
  return { female, male };
}

function signatureNames(rows: GenerationNameRow[], sex: "F" | "M"): GenerationNameRow[] {
  return rows
    .filter((row) => row.sex === sex && row.lifetimeTotal >= SIGNATURE_LIFETIME_FLOOR)
    .sort((a, b) => b.windowShare - a.windowShare || a.rank - b.rank)
    .slice(0, SIGNATURE_PER_SEX);
}

/**
 * Loads the generation profile from the product's existing annual SSA tables.
 * Returns null when the window has no rows at all (e.g. an empty database).
 */
export async function loadGenerationHubProfile(
  db: D1Database,
  definition: GenerationDefinition,
): Promise<GenerationProfile | null> {
  const previousDefinition = definition.previous ? getGenerationDefinition(definition.previous) : null;

  const [rows, totals, maxYearValue, previousRows] = await Promise.all([
    topNamesInYearRange(db, definition.startYear, definition.endYear, GENERATION_HUB_ROWS_PER_SEX),
    yearRangeTotals(db, definition.startYear, definition.endYear),
    getMeta(db, MAX_YEAR_KEY),
    previousDefinition ? topNamesInYearRange(db, previousDefinition.startYear, previousDefinition.endYear, 10) : Promise.resolve([]),
  ]);

  if (!rows.length) return null;

  const dataThroughYear = Number(maxYearValue ?? 0);
  const observedEnd = dataThroughYear > 0 ? Math.min(definition.endYear, dataThroughYear) : definition.endYear;

  const femaleBirths = totals.filter((row) => row.sex === "F").reduce((sum, row) => sum + row.total, 0);
  const maleBirths = totals.filter((row) => row.sex === "M").reduce((sum, row) => sum + row.total, 0);

  const girls = toRows(rows.filter((row) => row.sex === "F"));
  const boys = toRows(rows.filter((row) => row.sex === "M"));

  const { female: femaleChampion, male: maleChampion } = champions([...girls, ...boys]);

  const previousChampions = champions(toRows(previousRows));
  const previous = previousDefinition
    ? {
        label: previousDefinition.label,
        startYear: previousDefinition.startYear,
        endYear: previousDefinition.endYear,
        femaleChampion: previousChampions.female,
        maleChampion: previousChampions.male,
      }
    : undefined;

  return {
    slug: definition.slug,
    label: definition.label,
    seoLabel: definition.seoLabel,
    startYear: definition.startYear,
    endYear: definition.endYear,
    observedEnd,
    isComplete: definition.endYear <= dataThroughYear,
    dataThroughYear,
    totalBirths: femaleBirths + maleBirths,
    femaleBirths,
    maleBirths,
    girls,
    boys,
    femaleChampion: femaleChampion ?? girls[0]!,
    maleChampion: maleChampion ?? boys[0]!,
    signatureGirls: signatureNames(girls, "F"),
    signatureBoys: signatureNames(boys, "M"),
    previous,
  };
}
