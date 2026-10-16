// Life table: age recorded births into an estimated living population.
//
// `data/manual/life-table.csv` holds sparse survival checkpoints (age ->
// cumulative probability of surviving from birth to that age, per sex).
// These helpers are shared by the offline enrichment builder
// (scripts/build-enrichment.ts) and the content factory's living-population
// families, so both compute identical numbers from the same table.
//
// The file is a flat three-column CSV (`sex,age,survival_probability`) with no
// quoted fields, so it is parsed line by line rather than through the general
// CSV reader.

import type { Sex } from "./schema";

/** One checkpoint of data/manual/life-table.csv: cumulative survival from birth to `age`. */
export interface LifeTableRow {
  sex: Sex;
  age: number;
  survival_probability: number;
}

export type SurvivalTable = Record<Sex, [number, number][]>; // sorted [age, survival]

/** Parses data/manual/life-table.csv (header row `sex,age,survival_probability`). */
export function parseLifeTableCsv(text: string): LifeTableRow[] {
  const out: LifeTableRow[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const parts = line.split(",");
    const sex = parts[0]!.trim();
    const age = Number(parts[1]);
    const survival = Number(parts[2]);
    if (sex !== "M" && sex !== "F") continue;
    if (!Number.isFinite(age) || !Number.isFinite(survival)) continue;
    out.push({ sex, age, survival_probability: survival });
  }
  return out;
}

export function buildSurvivalTable(rows: LifeTableRow[]): SurvivalTable {
  const table: SurvivalTable = { M: [], F: [] };
  for (const r of rows) table[r.sex].push([r.age, r.survival_probability]);
  table.M.sort((a, b) => a[0] - b[0]);
  table.F.sort((a, b) => a[0] - b[0]);
  return table;
}

/** The CLI refuses a life table that lacks either sex before it fetches anything. */
export function assertLifeTableComplete(table: SurvivalTable): void {
  if (!table.M.length || !table.F.length) throw new Error("life-table.csv missing M or F rows");
}

export function survivalAt(table: SurvivalTable, sex: Sex, age: number): number {
  const pts = table[sex];
  if (!pts.length) throw new Error(`life table has no rows for sex ${sex}`);
  if (age <= pts[0]![0]) return pts[0]![1];
  if (age >= pts[pts.length - 1]![0]) return pts[pts.length - 1]![1];
  for (let i = 1; i < pts.length; i++) {
    const [a1, s1] = pts[i]!;
    if (age <= a1) {
      const [a0, s0] = pts[i - 1]!;
      const t = (age - a0) / (a1 - a0);
      return s0 + t * (s1 - s0);
    }
  }
  return pts[pts.length - 1]![1];
}

export interface LivingAgeDistribution {
  /** Estimated living bearers of the name at `analysisYear`. */
  living: number;
  /** Estimated living bearers by age (age at `analysisYear` -> people). */
  ages: Map<number, number>;
}

/**
 * Ages one name's birth-year series into an estimated living population.
 * Birth-year cohorts are carried forward to `analysisYear` with the life
 * table's cumulative survival for the bearer's sex. Births after the analysis
 * year are ignored. Returns a zero distribution when the series is empty.
 */
export function livingAgeDistribution(
  series: Record<number, number> | Map<number, number>,
  sex: Sex,
  analysisYear: number,
  table: SurvivalTable,
): LivingAgeDistribution {
  const ages = new Map<number, number>();
  let living = 0;
  const entries = series instanceof Map ? series.entries() : Object.entries(series);
  for (const [year, count] of entries) {
    const y = Number(year);
    const c = Number(count);
    if (!Number.isFinite(y) || !Number.isFinite(c) || c <= 0) continue;
    const age = analysisYear - y;
    if (age < 0) continue;
    const alive = c * survivalAt(table, sex, age);
    living += alive;
    ages.set(age, (ages.get(age) ?? 0) + alive);
  }
  return { living, ages };
}

/** Share of a living-population age distribution inside [from, to). */
export function ageShare(ages: Map<number, number>, living: number, from: number, to: number): number {
  if (living <= 0) return 0;
  let sum = 0;
  for (const [age, weight] of ages) {
    if (age >= from && age < to) sum += weight;
  }
  return sum / living;
}
