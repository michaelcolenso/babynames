// Verifies the per-capita breakout rules in diaspora-compute:
//   * legacy names (first national year <= 1910) get no origin — state records
//     begin in 1910 so their geographic origin is unobservable;
//   * origin = the first state where the name is genuinely over-represented
//     (location quotient >= LQ_TRIGGER) with a substantive, significant count;
//   * tiny-state noise (huge LQ off a handful of births) never wins, because
//     the breakout count must clear MIN_BREAKOUT_COUNT and a Poisson z-score;
//   * diffusion records each over-represented state from the origin year on;
//   * the location quotient uses SEX-SPECIFIC denominators.
// Run: npx tsx scripts/verify-diaspora-percapita.ts

import {
  addTotal,
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

// Build the location-quotient denominators from a flat list of (state, sex,
// year) birth totals, using the same addTotal() the worker/script use so the
// national ("") rollups match production exactly.
function mkTotals(entries: { state: string; sex: string; year: number; births: number }[]): StateYearTotals {
  const totals: StateYearTotals = new Map();
  for (const e of entries) addTotal(totals, e.state, e.sex, e.year, e.births);
  return totals;
}

const F = "F";
const EMERGENT = 1990; // first national year well after state records begin
const LEGACY = 1900; // predates state-level data (1910)

// 1) Legacy names get no origin regardless of how concentrated the rows look.
{
  const rows: StateCountRow[] = [{ year: 1910, state: "NV", count: 500 }];
  const totals = mkTotals([
    { state: "NV", sex: F, year: 1910, births: 1000 },
    { state: "CA", sex: F, year: 1910, births: 9000 },
  ]);
  const r = computeDiasporaForName(rows, totals, LEGACY, F);
  assert(r.originState === null && r.totalStates === 0, `legacy name (pre-1910) has no observable origin (got ${r.originState})`);
}

// 2) A genuine breakout: TX is over-represented on a substantive, significant
//    count → it is the origin; the evenly-represented state is not.
{
  const rows: StateCountRow[] = [
    { year: 2000, state: "CA", count: 100 },
    { year: 2000, state: "TX", count: 140 },
  ];
  const totals = mkTotals([
    { state: "CA", sex: F, year: 2000, births: 10000 },
    { state: "TX", sex: F, year: 2000, births: 5000 },
  ]);
  const r = computeDiasporaForName(rows, totals, EMERGENT, F);
  assert(r.originState === "TX" && r.originYear === 2000, `breakout state with high LQ is the origin (got ${r.originState}, ${r.originYear})`);
}

// 3) THE ARTIFACT FIX. Nevada's 10 Marys against 67 total births produced a
//    location quotient of ~15 — but 10 births is noise. MIN_BREAKOUT_COUNT
//    rejects it, so the tiny state never wins.
{
  const rows: StateCountRow[] = [
    { year: 2000, state: "NV", count: 10 }, // LQ ~15 but only 10 births
    { year: 2000, state: "CA", count: 1000 }, // proportional, not a breakout
  ];
  const totals = mkTotals([
    { state: "NV", sex: F, year: 2000, births: 67 },
    { state: "CA", sex: F, year: 2000, births: 100000 },
  ]);
  const r = computeDiasporaForName(rows, totals, EMERGENT, F);
  assert(r.originState !== "NV", `tiny-state noise (10 births, huge LQ) never becomes the origin (got ${r.originState})`);
  assert(r.originState === null, `no qualifying breakout → null origin (got ${r.originState})`);
}

// 4) Significance guard. A state clears MIN_BREAKOUT_COUNT and LQ_TRIGGER but
//    its count sits within Poisson noise of expectation (z < MIN_Z) → rejected.
{
  const rows: StateCountRow[] = [{ year: 2000, state: "SS", count: 16 }];
  const totals = mkTotals([
    { state: "SS", sex: F, year: 2000, births: 1000 }, // expected ≈ 10, LQ ≈ 1.6, z ≈ 1.9
    { state: "XX", sex: F, year: 2000, births: 600 },
  ]);
  const r = computeDiasporaForName(rows, totals, EMERGENT, F);
  assert(r.originState === null, `an over-representation within sampling noise (z<MIN_Z) is rejected (got ${r.originState})`);
}

// 5) Diffusion: states that break out after the origin are recorded in order.
{
  const rows: StateCountRow[] = [
    { year: 2000, state: "TX", count: 200 },
    { year: 2002, state: "OK", count: 200 },
  ];
  const totals = mkTotals([
    { state: "TX", sex: F, year: 2000, births: 5000 },
    { state: "CA", sex: F, year: 2000, births: 50000 },
    { state: "OK", sex: F, year: 2002, births: 4000 },
    { state: "CA", sex: F, year: 2002, births: 50000 },
  ]);
  const r = computeDiasporaForName(rows, totals, EMERGENT, F);
  assert(r.originState === "TX" && r.originYear === 2000, `origin is the earliest breakout (got ${r.originState}, ${r.originYear})`);
  assert(r.totalStates === 2 && r.diffusionYears === 2, `later breakout joins the spread (states=${r.totalStates}, years=${r.diffusionYears})`);
}

// 6) SEX-SPECIFIC denominators. In state MM, female births (1,000) are dwarfed
//    by male births (20,000). A female name at 200/1,000 female births is a real
//    2× breakout — but if the LQ divided by BOTH sexes' births it would compute
//    ~1.05× and miss it. The fix must use the female-only denominator.
{
  const rows: StateCountRow[] = [{ year: 2000, state: "MM", count: 200 }];
  const totals = mkTotals([
    { state: "MM", sex: F, year: 2000, births: 1000 },
    { state: "MM", sex: "M", year: 2000, births: 20000 }, // male-skewed state
    { state: "XX", sex: F, year: 2000, births: 1000 },
  ]);
  const r = computeDiasporaForName(rows, totals, EMERGENT, F);
  assert(r.originState === "MM", `sex-specific denominator finds the breakout a both-sex denominator would hide (got ${r.originState})`);
}

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll diaspora per-capita assertions passed.");
