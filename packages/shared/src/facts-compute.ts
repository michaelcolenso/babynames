// Pure, dependency-free computation of the rare-name story metrics stored in
// `name_facts`.
//
// These run offline in scripts/build-name-facts.ts over the full SSA corpus —
// rarity rank needs a global sort and state concentration needs the ~6M-row
// namesbystate corpus, neither of which the ingest worker's 200-name streaming
// pager can see. Nothing here touches D1 or the network, so every threshold is
// unit-testable in isolation (scripts/facts-compute.test.ts).
//
// The thresholds are exported as named constants specifically so the tests
// assert on them rather than on magic numbers copied out of this file.

import type { RarityBand } from "./schema";

/** SSA's national file suppresses any (name, sex, year) below this count, so a
 *  recorded 5 is really "5 or more" and a missing year is really "0 to 4". */
export const SSA_REPORTING_FLOOR = 5;

/** "Given to fewer than ten babies" — a name whose best year never cleared this. */
export const SUB_TEN_MAX_ANNUAL = 10;

/** Spike detection. A year must clear MIN_COUNT to be a candidate at all (else
 *  4 births against a baseline of 1 reads as a 4x "spike"), and the baseline is
 *  floored so a from-nothing debut cannot divide by zero. */
export const SPIKE_MIN_COUNT = 25;
export const SPIKE_BASELINE_FLOOR = 3;
export const SPIKE_BASELINE_WINDOW = 3;
/** At or above this ratio the spike is "dramatic" enough for the collection. */
export const SPIKE_DRAMATIC_RATIO = 4;
/** Years after the spike used to check whether it actually fell back. */
export const SPIKE_POST_WINDOW = 3;
/** A one-hit spike must fall to at most this fraction of its peak year.
 *  Without it, a step change — 20 a year, then 100 a year forever — reads as a
 *  5x "spike" and a sustained rise gets filed under names that fell back. */
export const SPIKE_FELL_BACK_RATIO = 0.5;

/** Comeback: dormant at least this long, then genuinely used again. */
export const COMEBACK_MIN_GAP = 50;
export const COMEBACK_MIN_REVIVAL_MEAN = 5;
export const COMEBACK_WINDOW = 5;

/** "On the verge": still recorded, but barely, and falling fast. Deliberately a
 *  smaller-name cohort than landingFlags().isEndangered (which needs peak >= 500)
 *  so the collection does not duplicate /endangered. */
export const VERGE_MAX_LATEST = 10;
export const VERGE_MIN_PEAK = 100;
export const VERGE_MAX_RATIO = 0.25;
export const VERGE_WINDOW = 5;

/** State exclusivity. Below MIN_BIRTHS, SSA's per-state suppression makes a
 *  100%-one-state reading an artifact of the floor rather than a fact.
 *
 *  The share is taken against NATIONAL births in the state-data era, never
 *  against the sum of visible state rows. SSA suppresses any state-year under
 *  five births, so a name with 20 visible Texas births and two thousand more
 *  scattered below the floor nationwide would otherwise read as 100% Texas.
 *  Using the national denominator also makes coverage implicit: clearing a 90%
 *  share is only possible when the state file accounts for ~90% of the name. */
export const EXCLUSIVE_MIN_SHARE = 0.9;
export const EXCLUSIVE_MIN_BIRTHS = 20;

export interface GapResult {
  length: number;
  start: number;
  end: number;
}

export interface SpikeResult {
  year: number;
  ratio: number;
  baseline: number;
  /** Mean of the following years as a fraction of the spike year. Null when the
   *  spike is too recent to have a post-window, in which case whether it fell
   *  back is simply not yet knowable. */
  postRatio: number | null;
}

export interface ComebackResult {
  gap: number;
  year: number;
  strength: number;
}

export interface StateConcentration {
  top: string | null;
  /** Top state's births as a fraction of NATIONAL births in the state-data era. */
  share: number;
  exclusive: string | null;
  statesSeen: number;
  /** Fraction of national births the state file actually accounts for. Below
   *  1.0 the remainder sits under the per-state reporting floor. */
  coverage: number;
}

export interface SeriesFacts {
  firstYear: number;
  lastYear: number;
  yearsRecorded: number;
  spanYears: number;
  maxAnnual: number;
  gap: GapResult | null;
  spike: SpikeResult | null;
  comeback: ComebackResult | null;
  isOneAndDone: boolean;
  isSubTen: boolean;
  isVerge: boolean;
}

function years(series: Record<number, number>): number[] {
  return Object.keys(series)
    .map(Number)
    .filter((y) => Number.isFinite(y) && (series[y] ?? 0) > 0)
    .sort((a, b) => a - b);
}

function meanOver(series: Record<number, number>, from: number, to: number): number {
  if (to < from) return 0;
  let sum = 0;
  for (let y = from; y <= to; y++) sum += series[y] ?? 0;
  return sum / (to - from + 1);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Longest run of zero years strictly inside the recorded span. Years outside
 * [firstYear, lastYear] are not dormancy — the name simply did not exist yet,
 * or has not been used since.
 */
export function computeLongestGap(series: Record<number, number>): GapResult | null {
  const ys = years(series);
  if (ys.length < 2) return null;
  let best: GapResult | null = null;
  for (let i = 1; i < ys.length; i++) {
    const prev = ys[i - 1] as number;
    const curr = ys[i] as number;
    const length = curr - prev - 1;
    if (length > 0 && (!best || length > best.length)) {
      best = { length, start: prev + 1, end: curr - 1 };
    }
  }
  return best;
}

/**
 * The single most dramatic year-over-baseline jump. Baseline is the median of
 * the *recorded* years in the preceding SPIKE_BASELINE_WINDOW, so a name that
 * was steadily popular does not register a spike just for wobbling, and a name
 * with no prior usage is not counted at all.
 */
export function computeSpike(series: Record<number, number>, yM?: number): SpikeResult | null {
  const lastYear = yM ?? Math.max(...years(series), 0);
  // Two candidates are tracked. `best` is the most dramatic jump of any shape,
  // which is what the name page's "Inflection" cell reports. `bestFellBack` is
  // the most dramatic one that also came back down, which is the only kind the
  // one-hit-spikes collection can honestly claim. Keeping only the former would
  // lose a genuine transient spike behind a larger permanent step up.
  let best: SpikeResult | null = null;
  let bestFellBack: SpikeResult | null = null;
  for (const y of years(series)) {
    const count = series[y] ?? 0;
    if (count < SPIKE_MIN_COUNT) continue;
    const prior: number[] = [];
    for (let k = 1; k <= SPIKE_BASELINE_WINDOW; k++) {
      const v = series[y - k] ?? 0;
      if (v > 0) prior.push(v);
    }
    // No prior usage at all is a debut, not a spike — and without this guard
    // every name's first recorded year divides by the baseline floor and wins.
    // Debut-driven surges are covered by the catalyst data instead.
    if (!prior.length) continue;
    const baseline = median(prior);
    const ratio = count / Math.max(baseline, SPIKE_BASELINE_FLOOR);
    // Did it come back down? Measured over the years after the spike, so a
    // permanent step up is distinguishable from a one-year event.
    const postEnd = y + SPIKE_POST_WINDOW;
    const postRatio =
      postEnd <= lastYear ? Number((meanOver(series, y + 1, postEnd) / count).toFixed(3)) : null;
    const candidate: SpikeResult = {
      year: y,
      ratio: Number(ratio.toFixed(2)),
      baseline: Math.round(baseline),
      postRatio,
    };

    if (!best || candidate.ratio > best.ratio) best = candidate;
    // The fall-back candidate has to be a dramatic jump in its own right.
    // Without the ratio floor, the tail of a series that simply stops reads as
    // a fall (nothing follows it, so postRatio is 0) and an unremarkable year
    // would outrank the actual spike.
    if (
      candidate.ratio >= SPIKE_DRAMATIC_RATIO &&
      postRatio !== null &&
      postRatio <= SPIKE_FELL_BACK_RATIO &&
      (!bestFellBack || candidate.ratio > bestFellBack.ratio)
    ) {
      bestFellBack = candidate;
    }
  }
  // Prefer a spike that demonstrably fell back; it satisfies both consumers.
  // Otherwise report the largest jump, which the collection filter will reject
  // on its post-ratio.
  return bestFellBack ?? best;
}

/** Every run of zero years strictly inside the recorded span, longest first. */
export function listGaps(series: Record<number, number>): GapResult[] {
  const ys = years(series);
  const out: GapResult[] = [];
  for (let i = 1; i < ys.length; i++) {
    const prev = ys[i - 1] as number;
    const curr = ys[i] as number;
    const length = curr - prev - 1;
    if (length > 0) out.push({ length, start: prev + 1, end: curr - 1 });
  }
  return out.sort((a, b) => b.length - a.length || a.start - b.start);
}

/**
 * A revival after a long dormancy. Requires both a gap of COMEBACK_MIN_GAP and
 * real post-gap usage — otherwise a single stray birth 60 years later reads as
 * a comeback.
 *
 * Every qualifying gap is tested, not just the longest. A name can have a
 * 60-year gap that ends in one stray birth and a later 50-year gap followed by
 * sustained use; only checking the longest would reject the genuine comeback.
 */
export function computeComeback(series: Record<number, number>): ComebackResult | null {
  for (const gap of listGaps(series)) {
    if (gap.length < COMEBACK_MIN_GAP) continue;
    const revivalYear = gap.end + 1;
    const postMean = meanOver(series, revivalYear, revivalYear + COMEBACK_WINDOW - 1);
    if (postMean < COMEBACK_MIN_REVIVAL_MEAN) continue;
    const preMean = meanOver(series, gap.start - COMEBACK_WINDOW, gap.start - 1);
    return {
      gap: gap.length,
      year: revivalYear,
      strength: Number((postMean / Math.max(preMean, 1)).toFixed(2)),
    };
  }
  return null;
}

/**
 * Still recorded, but in single digits and collapsing. `yM` is the latest year
 * in the corpus.
 */
export function isOnTheVerge(series: Record<number, number>, yM: number, peakCount: number): boolean {
  const latest = series[yM] ?? 0;
  if (latest < 1 || latest > VERGE_MAX_LATEST) return false;
  if (peakCount < VERGE_MIN_PEAK) return false;
  const recent = meanOver(series, yM - VERGE_WINDOW + 1, yM);
  const prior = meanOver(series, yM - VERGE_WINDOW * 2 + 1, yM - VERGE_WINDOW);
  if (prior <= 0) return false;
  return recent / prior < VERGE_MAX_RATIO;
}

/**
 * Rarity band, keyed on lifetime births rather than on the percentile.
 *
 * The percentile cannot carry this: 14% of male names share total_count = 5, so
 * a tie-aware percentile tops out around 86 and no name would ever reach a
 * 99.5-style "ultra-rare" cutoff. Absolute volume is also stable across
 * releases, where a percentile shifts every time the tail grows.
 *
 * Cutoffs are calibrated against the live corpus (117,826 names): roughly 55%
 * of names fall under 100 lifetime births, 83% under 500, and 96% under 5,000.
 */
export const RARITY_BAND_CUTOFFS: readonly [number, RarityBand][] = [
  [100, "ultra-rare"],
  [1_000, "very-rare"],
  [10_000, "rare"],
  [100_000, "uncommon"],
  [1_000_000, "common"],
];

export function rarityBand(totalCount: number): RarityBand {
  for (const [ceiling, band] of RARITY_BAND_CUTOFFS) {
    if (totalCount < ceiling) return band;
  }
  return "ubiquitous";
}

/**
 * Where a name actually lives, from the per-state SSA corpus. `byState` maps a
 * two-letter abbreviation to lifetime births in that state.
 *
 * `nationalInStateEra` is the name's national births over the years the state
 * file covers, and is the denominator for `share`. Passing the visible state
 * sum instead would turn the reporting floor into fake exclusivity — see
 * EXCLUSIVE_MIN_SHARE.
 */
export function computeStateConcentration(
  byState: Record<string, number>,
  nationalInStateEra: number,
): StateConcentration {
  let top: string | null = null;
  let topCount = 0;
  let visible = 0;
  let statesSeen = 0;
  for (const [state, count] of Object.entries(byState)) {
    if (count <= 0) continue;
    statesSeen++;
    visible += count;
    if (count > topCount) {
      topCount = count;
      top = state;
    }
  }
  if (!top || visible <= 0) {
    return { top: null, share: 0, exclusive: null, statesSeen: 0, coverage: 0 };
  }
  // The state file can never exceed the national count; if the two disagree
  // (mismatched vintages), fall back to the visible sum so share stays <= 1.
  const denominator = Math.max(nationalInStateEra, visible);
  const share = topCount / denominator;
  const exclusive = share >= EXCLUSIVE_MIN_SHARE && topCount >= EXCLUSIVE_MIN_BIRTHS ? top : null;
  return {
    top,
    share: Number(share.toFixed(4)),
    exclusive,
    statesSeen,
    coverage: Number((visible / denominator).toFixed(4)),
  };
}

/**
 * Everything derivable from a single name's national series.
 * Returns null for an empty series.
 */
export function computeSeriesFacts(series: Record<number, number>, yM: number): SeriesFacts | null {
  const ys = years(series);
  if (!ys.length) return null;
  const firstYear = ys[0] as number;
  const lastYear = ys[ys.length - 1] as number;
  let maxAnnual = 0;
  for (const y of ys) maxAnnual = Math.max(maxAnnual, series[y] ?? 0);

  return {
    firstYear,
    lastYear,
    yearsRecorded: ys.length,
    spanYears: lastYear - firstYear + 1,
    maxAnnual,
    gap: computeLongestGap(series),
    spike: computeSpike(series, yM),
    comeback: computeComeback(series),
    isOneAndDone: ys.length === 1,
    isSubTen: maxAnnual < SUB_TEN_MAX_ANNUAL,
    isVerge: isOnTheVerge(series, yM, maxAnnual),
  };
}
