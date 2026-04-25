// Single source of truth for name-status classification. Used by:
//   - apps/ingest-worker     (writes status into D1 at finalize-time)
//   - apps/web SSR + API     (reads pre-classified status from D1)
//   - scripts/verify-parity  (recomputes from old shards, diffs against DB)
//
// Rules match the prose on /about.html.

import type { Status } from "./schema";

export interface ClassifyInput {
  // Map of year -> count, sparse (only years with reported counts).
  series: Record<number, number>;
  // The latest year present in the dataset overall (yM).
  yM: number;
}

export interface ClassifyResult {
  firstYear: number;
  lastYear: number;
  peakYear: number;
  peakCount: number;
  totalCount: number;
  latestCount: number;
  status: Status;
  declinePct: number | null;
  prevDecadeTotal: number;
  currDecadeTotal: number;
  growthX: number | null;
}

export function classify(input: ClassifyInput): ClassifyResult | null {
  const { series, yM } = input;
  const years = Object.keys(series).map(Number).sort((a, b) => a - b);
  if (!years.length) return null;

  const firstYear = years[0]!;
  const lastYear = years[years.length - 1]!;

  let peakYear = firstYear;
  let peakCount = series[firstYear] ?? 0;
  let totalCount = 0;
  for (const y of years) {
    const c = series[y] ?? 0;
    totalCount += c;
    if (c > peakCount) {
      peakCount = c;
      peakYear = y;
    }
  }
  const latestCount = series[yM] ?? 0;

  const sumRange = (lo: number, hi: number) => {
    let s = 0;
    for (let y = lo; y <= hi; y++) s += series[y] ?? 0;
    return s;
  };
  const last5 = sumRange(yM - 4, yM) / 5;
  const prev5 = sumRange(yM - 9, yM - 5) / 5;
  const prevDecadeTotal = sumRange(yM - 19, yM - 10);
  const currDecadeTotal = sumRange(yM - 9, yM);
  const growthX =
    prevDecadeTotal > 0 ? +(currDecadeTotal / prevDecadeTotal).toFixed(1) : null;

  let status: Status;
  if (latestCount === 0 && lastYear <= yM - 10) status = "extinct";
  else if (peakCount >= 200 && latestCount > 0 && latestCount <= peakCount * 0.1)
    status = "endangered";
  else if (last5 > 0 && prev5 > 0 && last5 / prev5 >= 1.2) status = "rising";
  else if (last5 > 0 && prev5 > 0 && last5 / prev5 <= 0.8) status = "declining";
  else if (latestCount === 0) status = "declining";
  else status = "stable";

  const declinePct =
    peakCount > 0 ? +(100 * (1 - latestCount / peakCount)).toFixed(1) : null;

  return {
    firstYear,
    lastYear,
    peakYear,
    peakCount,
    totalCount,
    latestCount,
    status,
    declinePct,
    prevDecadeTotal,
    currDecadeTotal,
    growthX,
  };
}

// Landing-page eligibility — these are the same thresholds the legacy
// build_data.py used so the tables don't change post-migration.
export interface LandingFlags {
  isExtinct: boolean;
  isEndangered: boolean;
  isRising: boolean;
}

export function landingFlags(c: ClassifyResult, yM: number): LandingFlags {
  const isExtinct =
    c.peakCount >= 500 && c.latestCount === 0 && yM - c.lastYear >= 10;
  const isEndangered =
    c.peakCount >= 500 &&
    c.latestCount > 0 &&
    c.latestCount <= 50 &&
    c.latestCount <= c.peakCount * 0.1;
  const isRising =
    c.latestCount >= 100 &&
    c.prevDecadeTotal >= 10 &&
    c.currDecadeTotal >= c.prevDecadeTotal * 5;
  return { isExtinct, isEndangered, isRising };
}

