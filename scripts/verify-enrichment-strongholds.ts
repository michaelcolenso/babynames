#!/usr/bin/env tsx
// Regression checks for current-era stronghold retention.
// Run: npm run verify-strongholds

import { selectStoredRegionalAnomalies } from "../packages/shared/src/enrichment-compute";

interface Candidate {
  id: string;
  state: string;
  eraStartYear: number;
  lq: number;
}

let failures = 0;
function assert(condition: boolean, message: string): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${message}`);
  if (!condition) failures++;
}

// The latest-era rows are weaker than three historical peaks. They must still
// be stored or getNameStrongholds() cannot render a truthful current map.
const rows: Candidate[] = [
  { id: "old-ca", state: "CA", eraStartYear: 1980, lq: 8 },
  { id: "old-tx", state: "TX", eraStartYear: 1990, lq: 6 },
  { id: "old-fl", state: "FL", eraStartYear: 2000, lq: 4 },
  { id: "now-wa", state: "WA", eraStartYear: 2020, lq: 1.4 },
  { id: "now-or", state: "OR", eraStartYear: 2020, lq: 1.3 },
];
const selected = selectStoredRegionalAnomalies(rows, 2020);
const ids = new Set(selected.map((row) => row.id));
assert(
  ids.has("old-ca") && ids.has("old-tx") && ids.has("old-fl"),
  "historical top three remain available",
);
assert(
  ids.has("now-wa") && ids.has("now-or"),
  "weaker latest-era rows survive the all-time top-three truncation",
);
assert(
  selected.filter((row) => row.eraStartYear === 2020).length === 2,
  "latest-era rows are not duplicated when sets overlap",
);

const manyCurrent: Candidate[] = Array.from({ length: 15 }, (_, i) => ({
  id: `current-${i}`,
  state: `S${String(i).padStart(2, "0")}`,
  eraStartYear: 2020,
  lq: 3 - i / 100,
}));
assert(
  selectStoredRegionalAnomalies(manyCurrent, 2020).filter(
    (row) => row.eraStartYear === 2020,
  ).length === 12,
  "latest-era storage respects the twelve-state display cap",
);

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll stronghold assertions passed.");
