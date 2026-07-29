import assert from "node:assert/strict";
import test from "node:test";

import {
  COMEBACK_MIN_GAP,
  EXCLUSIVE_MIN_BIRTHS,
  SPIKE_DRAMATIC_RATIO,
  SPIKE_FELL_BACK_RATIO,
  SUB_TEN_MAX_ANNUAL,
  VERGE_MAX_LATEST,
  computeComeback,
  computeLongestGap,
  computeSeriesFacts,
  computeSpike,
  computeStateConcentration,
  isOnTheVerge,
  rarityBand,
} from "../packages/shared/src/facts-compute";

const YM = 2025;

function series(entries: [number, number][]): Record<number, number> {
  return Object.fromEntries(entries);
}

/** A flat run of `count` births per year across [from, to]. */
function flat(from: number, to: number, count: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = from; y <= to; y++) out.push([y, count]);
  return out;
}

test("one-and-done: a single recorded year", () => {
  const facts = computeSeriesFacts(series([[1931, 7]]), YM);
  assert.ok(facts);
  assert.equal(facts.isOneAndDone, true);
  assert.equal(facts.isSubTen, true);
  assert.equal(facts.firstYear, 1931);
  assert.equal(facts.lastYear, 1931);
  assert.equal(facts.yearsRecorded, 1);
  assert.equal(facts.spanYears, 1);
  assert.equal(facts.gap, null);
});

test("sub-ten is about the best year, not the total", () => {
  // 40 years of 8 births each is 320 births total but never clears ten in a year.
  const facts = computeSeriesFacts(series(flat(1900, 1939, 8)), YM);
  assert.ok(facts);
  assert.equal(facts.isSubTen, true);
  assert.equal(facts.isOneAndDone, false);
  assert.ok(facts.maxAnnual < SUB_TEN_MAX_ANNUAL);

  const notRare = computeSeriesFacts(series([[1900, 8], [1901, 400]]), YM);
  assert.equal(notRare?.isSubTen, false);
});

test("longest gap ignores the years outside the recorded span", () => {
  const gap = computeLongestGap(series([[1890, 12], [1895, 4], [1950, 9]]));
  assert.deepEqual(gap, { length: 54, start: 1896, end: 1949 });
});

test("comeback: dormant 55 years then genuinely used again", () => {
  const s = series([...flat(1900, 1947, 60), ...flat(2003, 2010, 40)]);
  const comeback = computeComeback(s);
  assert.ok(comeback);
  assert.ok(comeback.gap >= COMEBACK_MIN_GAP);
  assert.equal(comeback.year, 2003);
  assert.ok(comeback.strength > 0);
});

test("comeback rejects a stray birth after a long silence", () => {
  const s = series([...flat(1900, 1940, 60), [2005, 6]]);
  assert.ok((computeLongestGap(s)?.length ?? 0) >= COMEBACK_MIN_GAP);
  // Post-gap mean over the 5-year window is ~1.2, below the revival floor.
  assert.equal(computeComeback(s), null);
});

test("a later qualifying gap is found even when the longest one fails", () => {
  // 1880 and 1941 are isolated years; the 60-year gap ends in a stray birth,
  // but the 50-year gap after it is followed by sustained use. Testing only the
  // longest gap would reject this name outright.
  const s = series([[1880, 20], [1941, 6], ...flat(1992, 1996, 5)]);
  const comeback = computeComeback(s);
  assert.ok(comeback, "the valid 50-year revival was missed");
  assert.equal(comeback.year, 1992);
  assert.equal(comeback.gap, 50);
});

test("a revival too recent to observe is not yet a comeback", () => {
  // 15 births in yM-1 and 10 in yM after a long gap averages to exactly 5 over
  // a five-year window — but three of those years have not happened. The
  // collection claims the revival was measured over five following years, so
  // there is nothing to claim yet.
  const tooRecent = series([[1880, 20], ...flat(YM - 1, YM, 15)]);
  assert.equal(computeComeback(tooRecent, YM), null);

  // The same shape, with the window fully in the past, does qualify.
  const observed = series([[1880, 20], ...flat(YM - 10, YM - 6, 15)]);
  assert.ok(computeComeback(observed, YM));
});

test("comeback rejects a short dormancy", () => {
  const s = series([...flat(1960, 1980, 60), ...flat(1995, 2005, 60)]);
  assert.equal(computeComeback(s), null);
});

test("spike: one dramatic year against its own baseline", () => {
  const s = series([...flat(1955, 1961, 20), [1962, 400], ...flat(1963, 1970, 30)]);
  const spike = computeSpike(s);
  assert.ok(spike);
  assert.equal(spike.year, 1962);
  assert.ok(spike.ratio >= SPIKE_DRAMATIC_RATIO, `ratio was ${spike.ratio}`);
  assert.equal(spike.baseline, 20);
});

test("spike ignores tiny counts so noise cannot fake a jump", () => {
  // 4 births against a baseline of 1 would be a 4x ratio without the floor.
  assert.equal(computeSpike(series([[1900, 1], [1901, 1], [1902, 1], [1903, 4]])), null);
});

test("a steadily popular name registers no dramatic spike", () => {
  const spike = computeSpike(series(flat(1950, 2000, 500)));
  assert.ok(spike);
  assert.ok(spike.ratio < SPIKE_DRAMATIC_RATIO, `ratio was ${spike.ratio}`);
});

test("a sustained step up is not a one-hit spike", () => {
  // 20 a year, then 100 a year forever. The jump is real (5x) but the name
  // never came back down, so it must not read as a spike that fell back.
  const step = computeSpike(series([...flat(1950, 1959, 20), ...flat(1960, 1990, 100)]), YM);
  assert.ok(step);
  assert.equal(step.year, 1960);
  assert.ok(step.ratio >= SPIKE_DRAMATIC_RATIO);
  assert.ok(
    (step.postRatio ?? 0) > SPIKE_FELL_BACK_RATIO,
    `sustained rise reported postRatio ${step.postRatio}`,
  );

  // A genuine one-year event falls back hard.
  const oneHit = computeSpike(series([...flat(1955, 1961, 20), [1962, 400], ...flat(1963, 1970, 25)]), YM);
  assert.ok(oneHit);
  assert.equal(oneHit.year, 1962);
  assert.ok((oneHit.postRatio ?? 1) <= SPIKE_FELL_BACK_RATIO, `postRatio was ${oneHit.postRatio}`);
});

test("a transient spike is not hidden behind a larger permanent step up", () => {
  // 5 -> 100 sustained forever (a 20x step), then a later 4x one-year jump that
  // returns to baseline. Reporting only the highest ratio keeps the step, its
  // post-ratio fails the collection filter, and the genuine spike is lost.
  const s = series([
    ...flat(1950, 1954, 5),
    ...flat(1955, 1989, 100),
    [1990, 420],
    ...flat(1991, 2000, 100),
  ]);
  const spike = computeSpike(s, YM);
  assert.ok(spike);
  assert.equal(spike.year, 1990, `selected ${spike.year} instead of the transient spike`);
  assert.ok((spike.postRatio ?? 1) <= SPIKE_FELL_BACK_RATIO);
});

test("a spike too recent to judge reports an unknown post-ratio", () => {
  // Nothing after it yet, so whether it fell back is not knowable — and the
  // collection must not claim that it did.
  const recent = computeSpike(series([...flat(YM - 5, YM - 1, 20), [YM, 400]]), YM);
  assert.ok(recent);
  assert.equal(recent.postRatio, null);
});

test("verge: single digits now, after a real peak, falling fast", () => {
  const s = series([...flat(1950, 1990, 800), ...flat(2016, 2020, 60), ...flat(2021, YM, 6)]);
  assert.equal(isOnTheVerge(s, YM, 800), true);
});

test("the verge cutoff matches the collection's single-digit claim", () => {
  const big = (latest: number) =>
    series([...flat(1950, 1990, 800), ...flat(2016, 2020, 60), ...flat(2021, YM, latest)]);
  assert.equal(isOnTheVerge(big(9), YM, 800), true, "9 births is single digits");
  assert.equal(isOnTheVerge(big(10), YM, 800), false, "10 births is not single digits");
  assert.ok(VERGE_MAX_LATEST <= 9, "the threshold must not readmit double digits");
});

test("verge excludes names that were never popular and names already gone", () => {
  // Never cleared the peak floor.
  assert.equal(isOnTheVerge(series([...flat(2000, 2020, 30), ...flat(2021, YM, 5)]), YM, 30), false);
  // Already extinct: nothing in the latest year.
  assert.equal(isOnTheVerge(series(flat(1900, 1960, 900)), YM, 900), false);
  // Still healthy.
  assert.equal(isOnTheVerge(series(flat(1950, YM, 900)), YM, 900), false);
});

test("rarity bands key on lifetime births, not on the percentile", () => {
  // A percentile cannot carry this: 14% of male names share total_count = 5, so
  // a tie-aware percentile tops out near 86 and no name would ever clear a
  // 99.5-style cutoff. Volume is also stable as the tail grows each release.
  assert.equal(rarityBand(40), "ultra-rare");
  assert.equal(rarityBand(400), "very-rare");
  assert.equal(rarityBand(5_000), "rare");
  assert.equal(rarityBand(20_000), "uncommon");
  assert.equal(rarityBand(250_000), "common");
  assert.equal(rarityBand(2_000_000), "ubiquitous");
  // Monotonic: more births can never mean a rarer band.
  const order = ["ultra-rare", "very-rare", "rare", "uncommon", "common", "ubiquitous"];
  let prev = -1;
  for (const total of [1, 99, 100, 999, 1_000, 9_999, 10_000, 99_999, 100_000, 999_999, 1_000_000]) {
    const idx = order.indexOf(rarityBand(total));
    assert.ok(idx >= prev, `band went backwards at ${total}`);
    prev = idx;
  }
});

test("state concentration finds the stronghold and gates exclusivity", () => {
  const spread = computeStateConcentration({ WV: 120, OH: 60, PA: 20 }, 200);
  assert.equal(spread.top, "WV");
  assert.equal(spread.statesSeen, 3);
  assert.equal(spread.exclusive, null);

  const exclusive = computeStateConcentration({ TX: 200, NM: 5 }, 205);
  assert.equal(exclusive.exclusive, "TX");
  assert.ok(exclusive.share >= 0.9);

  // 100% of one state, but below the suppression-artifact floor.
  const artifact = computeStateConcentration({ VT: EXCLUSIVE_MIN_BIRTHS - 1 }, EXCLUSIVE_MIN_BIRTHS - 1);
  assert.equal(artifact.top, "VT");
  assert.equal(artifact.exclusive, null);

  assert.deepEqual(computeStateConcentration({}, 0), {
    top: null,
    share: 0,
    exclusive: null,
    statesSeen: 0,
    coverage: 0,
  });
});

test("the state share is a fraction of national births, not of visible state rows", () => {
  // The bug this guards: SSA suppresses any state-year under five births, so a
  // name spread thinly nationwide surfaces in only one state. Dividing by the
  // visible rows would call that 100% Texas and file it under only-in-texas.
  const thin = computeStateConcentration({ TX: 20 }, 2_000);
  assert.equal(thin.top, "TX");
  assert.equal(thin.exclusive, null, "a thinly-spread name must not read as exclusive");
  assert.ok(thin.share <= 0.02, `share was ${thin.share}`);
  assert.ok(thin.coverage <= 0.02, "coverage should expose how little the state file explains");

  // Genuinely concentrated: the state file accounts for nearly the whole name.
  const real = computeStateConcentration({ VT: 340, NH: 10 }, 355);
  assert.equal(real.exclusive, "VT");
  assert.ok(real.share >= 0.9);
  assert.ok(real.coverage >= 0.9);
});

test("state share never exceeds 1 when the corpora disagree", () => {
  // A stale national vintage could report fewer births than the state file.
  const skewed = computeStateConcentration({ TX: 500 }, 100);
  assert.ok(skewed.share <= 1, `share was ${skewed.share}`);
  assert.ok(skewed.coverage <= 1);
});

test("empty series yields no facts", () => {
  assert.equal(computeSeriesFacts({}, YM), null);
  assert.equal(computeSeriesFacts({ 1900: 0 }, YM), null);
});
