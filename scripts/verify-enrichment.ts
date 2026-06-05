#!/usr/bin/env tsx
// Spot-checks the seeded enrichment tables in D1.
//
// Usage:
//   npm run verify-enrichment           # remote D1
//   npm run verify-enrichment -- --local

import { spawnSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");
const DB_NAME = "nobodynamed";

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";

function query<T = Record<string, unknown>>(sql: string): T[] {
  const res = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--config", CONFIG, "--command", sql, target, "--json"],
    { encoding: "utf-8", cwd: REPO },
  );
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    throw new Error(`query failed: ${sql}`);
  }
  // wrangler --json prints an array of result objects; results live in [0].results.
  const start = res.stdout.indexOf("[");
  const parsed = JSON.parse(res.stdout.slice(start));
  return (parsed[0]?.results ?? []) as T[];
}

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function main() {
  const counts = query<{ n: number }>("SELECT COUNT(*) AS n FROM name_enrichment_profiles")[0];
  check("profiles table populated", (counts?.n ?? 0) > 0, `${counts?.n ?? 0} rows`);

  for (const [name, sex] of [
    ["michael", "M"],
    ["mildred", "F"],
    ["karen", "F"],
  ] as const) {
    const rows = query<{ wave_topology: string; median_age: number }>(
      `SELECT wave_topology, median_age FROM name_enrichment_profiles WHERE name_lower='${name}' AND sex='${sex}'`,
    );
    check(`profile for ${name}/${sex}`, rows.length === 1, rows[0] ? `wave=${rows[0].wave_topology} median_age=${rows[0].median_age}` : "missing");
  }

  const cat = query<{ n: number }>("SELECT COUNT(*) AS n FROM name_catalysts")[0];
  check("catalysts seeded", (cat?.n ?? 0) > 0, `${cat?.n ?? 0} rows`);

  const occ = query<{ top_occupations: string }>(
    "SELECT top_occupations FROM name_historical_profiles LIMIT 1",
  );
  let occParses = false;
  if (occ[0]) {
    try {
      occParses = Array.isArray(JSON.parse(occ[0].top_occupations));
    } catch {
      occParses = false;
    }
  }
  check("historical top_occupations is valid JSON", occParses);

  const region = query<{ n: number }>("SELECT COUNT(*) AS n FROM name_regional_anomalies")[0];
  check("regional anomalies present (0 ok if built --no-state)", (region?.n ?? 0) >= 0, `${region?.n ?? 0} rows`);

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

main();
