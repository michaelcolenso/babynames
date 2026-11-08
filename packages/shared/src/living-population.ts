// Living-population math shared by the offline enrichment builder and the
// name-page renderer.
//
// scripts/build-enrichment.ts stores the headline numbers (living estimate,
// median age, core range) in name_enrichment_profiles. The name page already
// carries the full birth series, so the finer-grained views — how the living
// population splits by generation, and how fast it would shrink with no new
// births — are derived here at render time from that same series and the same
// life table, with no extra rows read and no reseed. Both callers use
// `livingAgeMap`, so the stored figures and the render-time breakdown cannot
// drift apart algorithmically.

import type { Sex } from "./schema";

/**
 * Cumulative survival from birth to `age`, by sex. Mirrors
 * data/manual/life-table.csv exactly (scripts/enrichment.test.ts fails if they
 * diverge); see data/manual/README.md for where the values come from.
 */
export const LIFE_TABLE: Record<Sex, readonly (readonly [number, number])[]> = {
  M: [
    [0, 1.0], [1, 0.993032], [5, 0.991943], [10, 0.99108], [15, 0.989422], [20, 0.988035],
    [25, 0.984994], [30, 0.982003], [35, 0.975002], [40, 0.967996], [45, 0.952002],
    [50, 0.935992], [55, 0.905012], [60, 0.873986], [65, 0.809008], [70, 0.744003],
    [75, 0.624484], [80, 0.505027], [85, 0.346478], [90, 0.188004], [95, 0.107027],
    [100, 0.025948], [110, 0.001056], [119, 0.0],
  ],
  F: [
    [0, 1.0], [1, 0.993522], [5, 0.993163], [10, 0.992099], [15, 0.990945], [20, 0.989983],
    [25, 0.988032], [30, 0.985986], [35, 0.980994], [40, 0.976005], [45, 0.964008],
    [50, 0.951987], [55, 0.927008], [60, 0.902005], [65, 0.84599], [70, 0.789999],
    [75, 0.681504], [80, 0.572999], [85, 0.408998], [90, 0.245005], [95, 0.14304],
    [100, 0.040915], [110, 0.002108], [119, 0.0],
  ],
};

/** Linear interpolation over sorted [age, survival] checkpoints, clamped at both ends. */
export function interpolateSurvival(pts: readonly (readonly [number, number])[], age: number): number {
  if (!pts.length) throw new Error("life table has no rows");
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

/**
 * Estimated living people by age in `analysisYear`: each birth-year cohort
 * times its survival to that age. Cohorts born after `analysisYear` are skipped.
 */
export function livingAgeMap(
  series: Iterable<[number, number]>,
  survival: (age: number) => number,
  analysisYear: number,
): Map<number, number> {
  const ages = new Map<number, number>();
  for (const [year, count] of series) {
    const age = analysisYear - year;
    if (age < 0) continue;
    const alive = count * survival(age);
    ages.set(age, (ages.get(age) ?? 0) + alive);
  }
  return ages;
}

/**
 * Birth-year bands used for generational ownership. Boundaries match
 * content/generation-definitions.ts (the generation hubs) and
 * generationForYear() in render-name.ts; the first and last bands are open.
 */
export const GENERATION_BANDS: readonly { label: string; startYear: number; endYear: number }[] = [
  { label: "Greatest Generation", startYear: -Infinity, endYear: 1927 },
  { label: "Silent Generation", startYear: 1928, endYear: 1945 },
  { label: "Boomer", startYear: 1946, endYear: 1964 },
  { label: "Gen X", startYear: 1965, endYear: 1980 },
  { label: "Millennial", startYear: 1981, endYear: 1996 },
  { label: "Gen Z", startYear: 1997, endYear: 2012 },
  { label: "Gen Alpha", startYear: 2013, endYear: Infinity },
];

export interface GenerationShare {
  label: string;
  startYear: number;
  endYear: number;
  /** Fraction of the living population, 0–1. */
  share: number;
}

/** Living population split by birth generation, oldest first. Empty when nobody is alive. */
export function generationShares(ages: Map<number, number>, analysisYear: number): GenerationShare[] {
  const weights = GENERATION_BANDS.map(() => 0);
  let total = 0;
  for (const [age, w] of ages) {
    if (!(w > 0)) continue;
    const birthYear = analysisYear - age;
    const i = GENERATION_BANDS.findIndex((b) => birthYear >= b.startYear && birthYear <= b.endYear);
    weights[i] = (weights[i] ?? 0) + w;
    total += w;
  }
  if (total <= 0) return [];
  return GENERATION_BANDS.map((b, i) => ({ ...b, share: weights[i]! / total }));
}

/**
 * Whole years until today's living population falls to half, if nobody else
 * were given the name: each age cohort ages forward on the conditional survival
 * S(a+t)/S(a) of the same life table. Null when the population is empty or does
 * not halve within `maxYears` (a young population, where the counterfactual
 * says little).
 */
export function yearsToHalf(
  ages: Map<number, number>,
  survival: (age: number) => number,
  maxYears = 80,
): number | null {
  const cohorts: [number, number, number][] = []; // [age, living now, S(age)]
  let start = 0;
  for (const [age, w] of ages) {
    const s = survival(age);
    if (!(w > 0) || !(s > 0)) continue;
    cohorts.push([age, w, s]);
    start += w;
  }
  if (start <= 0) return null;
  for (let t = 1; t <= maxYears; t++) {
    let living = 0;
    for (const [age, w, s] of cohorts) living += (w * survival(age + t)) / s;
    if (living <= start / 2) return t;
  }
  return null;
}
