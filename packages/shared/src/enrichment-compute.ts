// Pure, dependency-free helpers for the Enrichment System.
//
// These are shared between the offline build script (scripts/build-enrichment.ts,
// which does the heavy lifting over the full SSA corpus) and the renderer
// (render-name.ts, which only calls the O(1) playgroundDensity at request time).

import type { WaveTopology } from "./schema";

// The reference year for actuarial math. Births are aged relative to this.
export const ANALYSIS_YEAR = 2026;

// Wave-topology thresholds (see spec §8.5).
export const WAVE_SIGMA_FLASH = 8; // birth-year std-dev below this = concentrated spike
export const WAVE_SIGMA_GLACIER = 25; // above this = long-duration classic
export const WAVE_RECENT_DELTA = 0.1; // ±10% recent momentum band

/**
 * Population (births) weighted standard deviation of birth years.
 * `weights` maps year -> births. Returns 0 when total weight is 0 or 1 point.
 */
export function weightedStdDev(weights: Map<number, number>): number {
  let total = 0;
  let mean = 0;
  for (const [year, w] of weights) {
    total += w;
    mean += year * w;
  }
  if (total <= 0) return 0;
  mean /= total;
  let variance = 0;
  for (const [year, w] of weights) {
    const d = year - mean;
    variance += w * d * d;
  }
  variance /= total;
  return Math.sqrt(variance);
}

export interface AgeQuantiles {
  low: number; // 25th percentile (youngest core)
  median: number; // 50th percentile
  high: number; // 75th percentile (oldest core)
}

/**
 * Quantiles of a living-population age distribution. `ages` maps age -> weight
 * (estimated living people of that age). Walks the CDF and returns the first
 * age at which cumulative share crosses 0.25 / 0.50 / 0.75.
 */
export function ageQuantiles(ages: Map<number, number>): AgeQuantiles {
  const entries = [...ages.entries()].filter(([, w]) => w > 0).sort((a, b) => a[0] - b[0]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0 || !entries.length) return { low: 0, median: 0, high: 0 };

  const at = (target: number): number => {
    let cum = 0;
    for (const [age, w] of entries) {
      cum += w;
      if (cum / total >= target) return age;
    }
    return entries[entries.length - 1]![0];
  };

  return { low: at(0.25), median: at(0.5), high: at(0.75) };
}

/**
 * Map a birth-year spread (sigma) and recent momentum (recentDelta) to a wave
 * topology label. recentDelta is the fractional change of the last 10 years vs
 * the prior 10 years; positive = growing.
 */
export function classifyWave(sigma: number, recentDelta: number): WaveTopology {
  if (sigma < WAVE_SIGMA_FLASH) return "Flash Flood";
  if (sigma > WAVE_SIGMA_GLACIER) return "Glacier";
  if (recentDelta <= -WAVE_RECENT_DELTA) return "Steady Decline";
  if (recentDelta >= WAVE_RECENT_DELTA) return "Steady Wave";
  return "Plateau";
}

/**
 * Probability that at least one *other* child in a classroom shares this name,
 * given the name's share of latest-year births of the same sex.
 */
export function playgroundDensity(latestPct: number, classroomSize = 30): number {
  const p = Math.min(Math.max(latestPct, 0), 1);
  const others = Math.max(0, classroomSize - 1);
  return 1 - Math.pow(1 - p, others);
}

export interface RegionalAnomalyCandidate {
  state: string;
  eraStartYear: number;
  lq: number;
}

/**
 * Preserve the all-time top anomalies used by the historical enrichment
 * dossier while also retaining the latest era's weaker rows for the
 * "Where it lives now" map.
 */
export function selectStoredRegionalAnomalies<T extends RegionalAnomalyCandidate>(
  rows: T[],
  currentEra: number,
  maxHistorical = 3,
  maxCurrent = 12,
): T[] {
  const ordered = [...rows].sort(
    (a, b) => b.lq - a.lq || a.state.localeCompare(b.state) || a.eraStartYear - b.eraStartYear,
  );
  const selected = ordered.slice(0, maxHistorical);
  const seen = new Set(selected.map((row) => `${row.state}|${row.eraStartYear}`));
  let currentCount = selected.filter((row) => row.eraStartYear === currentEra).length;

  for (const row of ordered) {
    if (currentCount >= maxCurrent) break;
    if (row.eraStartYear !== currentEra) continue;
    const key = `${row.state}|${row.eraStartYear}`;
    if (seen.has(key)) continue;
    selected.push(row);
    seen.add(key);
    currentCount++;
  }
  return selected;
}
