// Verifies the per-capita diffusion fix in diaspora-compute: a small state with
// a higher *rate* must be ranked as origin/earlier adopter than a large state
// with a higher raw *count*. Run: npx tsx scripts/verify-diaspora-percapita.ts
//
// This is a lightweight assertion script (the repo has no test runner); it
// exits non-zero on failure so it can gate CI if wired up later.

import {
  computeDiasporaForName,
  type StateCountRow,
  type StateYearTotals,
} from "../apps/ingest-worker/src/diaspora-compute";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("ok:", msg);
  }
}

// Big state (CA): 1,000,000 births/yr. Small state (WY): 5,000 births/yr.
const totals: StateYearTotals = new Map([
  ["CA", new Map([[2000, 1_000_000], [2001, 1_000_000]])],
  ["WY", new Map([[2000, 5_000], [2001, 5_000]])],
]);

// Year 2000: CA has 300 babies with the name (raw count >> WY) but that is only
// 30 per 100k — below threshold. WY has 10 (raw count tiny) but that is 200 per
// 100k — a real local concentration. Per capita, WY is the origin.
const rows: StateCountRow[] = [
  { year: 2000, state: "CA", count: 300 }, // 30/100k  -> not adopted
  { year: 2000, state: "WY", count: 10 }, //  200/100k -> adopted, origin
  { year: 2001, state: "CA", count: 2000 }, // 200/100k -> adopted in 2001
  { year: 2001, state: "WY", count: 10 }, //  still adopted
];

const result = computeDiasporaForName(rows, totals);

assert(
  result.originState === "WY",
  `origin is the high-rate small state, not the high-count big state (got ${result.originState})`,
);
assert(result.originYear === 2000, `origin year is 2000 (got ${result.originYear})`);

const caAdopt = result.spread.find((s) => s.state === "CA");
assert(
  caAdopt?.year === 2001,
  `CA only adopts in 2001 when its rate crosses threshold (got ${caAdopt?.year})`,
);

// A state that never crosses the per-capita threshold is never adopted, even
// with a large raw count.
const neverTotals: StateYearTotals = new Map([
  ["CA", new Map([[2000, 1_000_000]])],
]);
const neverRows: StateCountRow[] = [{ year: 2000, state: "CA", count: 50 }]; // 5/100k
const neverResult = computeDiasporaForName(neverRows, neverTotals);
assert(
  neverResult.originState === null && neverResult.totalStates === 0,
  "a sub-threshold raw count never registers as adoption",
);

// Raw-count floor: a tiny reported count in a tiny state shouldn't trip the
// rate threshold via denominator noise.
const floorTotals: StateYearTotals = new Map([["WY", new Map([[2000, 100]])]]);
const floorRows: StateCountRow[] = [{ year: 2000, state: "WY", count: 4 }]; // below MIN_BIRTHS
const floorResult = computeDiasporaForName(floorRows, floorTotals);
assert(
  floorResult.originState === null,
  "a count below the raw-count floor is ignored even at a high implied rate",
);

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll diaspora per-capita assertions passed.");
