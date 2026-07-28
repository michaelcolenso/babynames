import assert from "node:assert/strict";
import test from "node:test";

import {
  COMEBACK_MIN_GAP,
  EXCLUSIVE_MIN_BIRTHS,
  SPIKE_DRAMATIC_RATIO,
  SUB_TEN_MAX_ANNUAL,
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

test("verge: single digits now, after a real peak, falling fast", () => {
  const s = series([...flat(1950, 1990, 800), ...flat(2016, 2020, 60), ...flat(2021, YM, 6)]);
  assert.equal(isOnTheVerge(s, YM, 800), true);
});

test("verge excludes names that were never popular and names already gone", () => {
  // Never cleared the peak floor.
  assert.equal(isOnTheVerge(series([...flat(2000, 2020, 30), ...flat(2021, YM, 5)]), YM, 30), false);
  // Already extinct: nothing in the latest year.
  assert.equal(isOnTheVerge(series(flat(1900, 1960, 900)), YM, 900), false);
  // Still healthy.
  assert.equal(isOnTheVerge(series(flat(1950, YM, 900)), YM, 900), false);
});

test("rarity bands respect both percentile and absolute scale", () => {
  assert.equal(rarityBand(99.8, 400), "ultra-rare");
  assert.equal(rarityBand(98.5, 900), "very-rare");
  assert.equal(rarityBand(92, 5_000), "rare");
  assert.equal(rarityBand(70, 20_000), "uncommon");
  // A huge name can never be labelled rare just because the tail is long.
  assert.equal(rarityBand(99.9, 2_000_000), "ubiquitous");
  assert.equal(rarityBand(99.9, 250_000), "common");
});

test("state concentration finds the stronghold and gates exclusivity", () => {
  const spread = computeStateConcentration({ WV: 120, OH: 60, PA: 20 });
  assert.equal(spread.top, "WV");
  assert.equal(spread.statesSeen, 3);
  assert.equal(spread.exclusive, null);

  const exclusive = computeStateConcentration({ TX: 200, NM: 5 });
  assert.equal(exclusive.exclusive, "TX");
  assert.ok(exclusive.share >= 0.9);

  // 100% of one state, but below the suppression-artifact floor.
  const artifact = computeStateConcentration({ VT: EXCLUSIVE_MIN_BIRTHS - 1 });
  assert.equal(artifact.top, "VT");
  assert.equal(artifact.exclusive, null);

  assert.deepEqual(computeStateConcentration({}), { top: null, share: 0, exclusive: null, statesSeen: 0 });
});

test("empty series yields no facts", () => {
  assert.equal(computeSeriesFacts({}, YM), null);
  assert.equal(computeSeriesFacts({ 1900: 0 }, YM), null);
});
