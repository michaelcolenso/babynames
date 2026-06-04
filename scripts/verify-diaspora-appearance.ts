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

// CA and WY both first record the name in 2000. Appearance tracking chooses CA
// because same-year first appearances sort alphabetically.
const conc: StateCountRow[] = [
  { year: 2000, state: "CA", count: 300 },
  { year: 2000, state: "WY", count: 10 },
  { year: 2001, state: "CA", count: 20000 }, // CA later catches up
];
const concResult = computeDiasporaForName(conc);
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

// A sparse early year still counts if it appears in SSA state-level data.
const sparseRows: StateCountRow[] = [{ year: 1995, state: "WY", count: 5 }];
const sparseResult = computeDiasporaForName(sparseRows);
assert(
  sparseResult.originState === "WY" && sparseResult.originYear === 1995,
  `a recorded sparse appearance still establishes state presence (got ${sparseResult.originState}, ${sparseResult.originYear})`,
);

// A proportional national name still records the states where it appears.
const flatRows: StateCountRow[] = [
  { year: 2000, state: "CA", count: 500 },
  { year: 2000, state: "TX", count: 500 },
];
const flatResult = computeDiasporaForName(flatRows);
assert(
  flatResult.originState === "CA" && flatResult.totalStates === 2,
  `an evenly-distributed name still tracks first state appearances (got ${flatResult.originState}, ${flatResult.totalStates})`,
);

// Below THRESHOLD births never registers (SSA censoring floor).
const censoredResult = computeDiasporaForName([{ year: 2010, state: "VT", count: 3 }]);
assert(
  censoredResult.originState === null,
  "a count below THRESHOLD never registers as a state appearance",
);

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll diaspora appearance assertions passed.");
