// Verifies the diaspora appearance rules in diaspora-compute:
//   * a state adopts a name the first year it appears in SSA state-level data;
//   * origin = first state to record the name; same-year ties sort
//     alphabetically for determinism;
//   * every state with a recorded appearance is included in the spread;
//   * counts below SSA's threshold do not register as appearances.
// Run: npx tsx scripts/verify-diaspora-appearance.ts

import {
  computeDiasporaForName,
  type StateCountRow,
  type SexYearTotals,
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

function makeTotals(sex: "M" | "F", years: Record<number, number>): SexYearTotals {
  return new Map([[sex, new Map(Object.entries(years).map(([year, births]) => [Number(year), births]))]]);
}

// CA and WY both first record the name in 2000. Appearance tracking chooses CA
// because same-year first appearances sort alphabetically.
const conc: StateCountRow[] = [
  { year: 2000, state: "CA", count: 300 },
  { year: 2000, state: "WY", count: 10 },
  { year: 2001, state: "CA", count: 20000 }, // CA later catches up
];
const concResult = computeDiasporaForName(conc, "F", makeTotals("F", { 2000: 1_000_000, 2001: 1_000_000 }));
assert(
  concResult.originState === "CA",
  `origin is the first state where the name appears (got ${concResult.originState})`,
);
assert(concResult.originYear === 2000, `origin year is the first appearance year 2000 (got ${concResult.originYear})`);
assert(concResult.totalStates === 2, `raw state appearances include both states (got ${concResult.totalStates})`);
assert(
  concResult.spread.map((p) => `${p.state}:${p.year}`).join(",") === "CA:2000,WY:2000",
  `same-year first appearances sort alphabetically (got ${concResult.spread.map((p) => `${p.state}:${p.year}`).join(",")})`,
);
assert(
  concResult.spread.filter((p) => p.year === concResult.originYear).map((p) => p.state).join(",") === "CA,WY",
  "same-year origin states remain available as a cohort",
);

// Sparse early appearances are ignored once the name has a later nationally
// visible wave; states adopt when they first appear during that real wave.
const sparseRows: StateCountRow[] = [
  { year: 1995, state: "WY", count: 5 },
  { year: 2005, state: "CA", count: 120 },
  { year: 2005, state: "WY", count: 8 },
  { year: 2006, state: "TX", count: 15 },
];
const sparseResult = computeDiasporaForName(sparseRows, "F", makeTotals("F", { 1995: 2_000_000, 2005: 1_000_000, 2006: 1_000_000 }));
assert(
  sparseResult.originState === "CA" && sparseResult.originYear === 2005,
  `sparse pre-wave appearances do not establish state presence (got ${sparseResult.originState}, ${sparseResult.originYear})`,
);
assert(
  sparseResult.spread.map((p) => `${p.state}:${p.year}`).join(",") === "CA:2005,WY:2005,TX:2006",
  `state appearances are kept once the national wave begins (got ${sparseResult.spread.map((p) => `${p.state}:${p.year}`).join(",")})`,
);

// A proportional national name still records the states where it appears.
const flatRows: StateCountRow[] = [
  { year: 2000, state: "CA", count: 500 },
  { year: 2000, state: "TX", count: 500 },
];
const flatResult = computeDiasporaForName(flatRows, "F", makeTotals("F", { 2000: 2_000_000 }));
assert(
  flatResult.originState === "CA" && flatResult.totalStates === 2,
  `an evenly-distributed name still tracks first state appearances (got ${flatResult.originState}, ${flatResult.totalStates})`,
);

// Below THRESHOLD births never registers (SSA censoring floor).
const censoredResult = computeDiasporaForName([{ year: 2010, state: "VT", count: 3 }], "F", makeTotals("F", { 2010: 6_000 }));
assert(
  censoredResult.originState === null,
  "a count below THRESHOLD never registers as a state appearance",
);

// Rare/local names that never cross the national visibility floor still get a
// literal state appearance map.
const localRows: StateCountRow[] = [
  { year: 2004, state: "IA", count: 7 },
  { year: 2016, state: "NE", count: 5 },
];
const localResult = computeDiasporaForName(localRows, "M", makeTotals("M", { 2004: 2_000_000, 2016: 2_000_000 }));
assert(
  localResult.originState === "IA" && localResult.originYear === 2004 && localResult.totalStates === 2,
  `rare local names fall back to literal state appearances (got ${localResult.originState}, ${localResult.originYear}, ${localResult.totalStates})`,
);

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll diaspora appearance assertions passed.");
