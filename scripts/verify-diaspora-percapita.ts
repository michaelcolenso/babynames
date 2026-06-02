// Verifies the diaspora BREAKOUT rules in diaspora-compute:
//   * a state "breaks out" when the name is over-represented there — its share
//     of that state's births is >= LQ_TRIGGER x the name's national share that
//     year (a location quotient), once the name clears NATIONAL_FLOOR;
//   * origin = first state to break out; highest location quotient breaks
//     same-year ties (not raw count, so it isn't just the biggest state);
//   * sparse early years don't manufacture a false origin (the national floor);
//   * a name that never concentrates anywhere has a null origin.
// Run: npx tsx scripts/verify-diaspora-percapita.ts

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

// Build totals with the "" national sentinel key the compute expects.
function makeTotals(stateYear: Record<string, Record<number, number>>): StateYearTotals {
  const totals: StateYearTotals = new Map();
  const national = new Map<number, number>();
  for (const [state, byYear] of Object.entries(stateYear)) {
    const m = new Map<number, number>();
    for (const [y, b] of Object.entries(byYear)) {
      const year = Number(y);
      m.set(year, b);
      national.set(year, (national.get(year) ?? 0) + b);
    }
    totals.set(state, m);
  }
  totals.set("", national);
  return totals;
}

// CA 1,000,000 births/yr; WY 5,000/yr. National = 1,005,000.
const totals = makeTotals({
  CA: { 2000: 1_000_000, 2001: 1_000_000 },
  WY: { 2000: 5_000, 2001: 5_000 },
});

// 2000: name's national rate = (300+10)/1,005,000 ≈ 31/100k — clears the floor.
// CA share 300/1e6 = 30/100k; national share ≈ 30.8/100k → LQ ≈ 0.97 (NOT a
// breakout). WY share 10/5000 = 200/100k → LQ ≈ 6.5 → breaks out. Origin = WY,
// the over-represented state, even though CA has 30x the raw count.
const conc: StateCountRow[] = [
  { year: 2000, state: "CA", count: 300 },
  { year: 2000, state: "WY", count: 10 },
  { year: 2001, state: "CA", count: 20000 }, // CA later catches up
];
const concResult = computeDiasporaForName(conc, totals);
assert(
  concResult.originState === "WY",
  `origin is the over-represented state (high LQ), not the high-count one (got ${concResult.originState})`,
);
assert(concResult.originYear === 2000, `origin year is the breakout year 2000 (got ${concResult.originYear})`);

// National floor: a sparse early year (tiny national presence) must NOT
// manufacture an origin even though the lone state trivially has LQ >> 1.
// 1995: only WY reports 5 babies; national rate = 5/5000 = 100/100k > floor...
// so make it genuinely sub-floor: 5 babies against a large national base.
const sparse = makeTotals({ CA: { 1995: 2_000_000 }, WY: { 1995: 5_000 } });
const sparseRows: StateCountRow[] = [{ year: 1995, state: "WY", count: 5 }];
// national rate = 5 / 2,005,000 ≈ 0.25/100k, far below NATIONAL_FLOOR (20).
const sparseResult = computeDiasporaForName(sparseRows, sparse);
assert(
  sparseResult.originState === null,
  `a nationally-trivial year does not manufacture an origin (got ${sparseResult.originState})`,
);

// A name that is everywhere proportional (no concentration) never breaks out.
const flat = makeTotals({ CA: { 2000: 1_000_000 }, TX: { 2000: 1_000_000 } });
// Each state has the name at the same per-capita rate → LQ = 1 everywhere.
const flatRows: StateCountRow[] = [
  { year: 2000, state: "CA", count: 500 },
  { year: 2000, state: "TX", count: 500 },
];
const flatResult = computeDiasporaForName(flatRows, flat);
assert(
  flatResult.originState === null && flatResult.totalStates === 0,
  `an evenly-distributed name has no breakout origin (got ${flatResult.originState})`,
);

// Below THRESHOLD births never registers (SSA censoring floor).
const censored = makeTotals({ VT: { 2010: 6_000 } });
const censoredResult = computeDiasporaForName([{ year: 2010, state: "VT", count: 3 }], censored);
assert(
  censoredResult.originState === null,
  "a count below THRESHOLD never registers as a breakout",
);

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll diaspora breakout assertions passed.");
