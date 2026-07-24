#!/usr/bin/env tsx
// Weekly analytics report over the last 7 days of analytics_events.
//
// Usage:
//   npm run weekly-analytics-report           # remote D1
//   npm run weekly-analytics-report -- --local

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");

const wranglerToml = fs.readFileSync(CONFIG, "utf-8");
const dbNameMatch = wranglerToml.match(/^\s*database_name\s*=\s*"([^"]+)"/m);
if (!dbNameMatch) throw new Error(`Could not find database_name in ${CONFIG}`);
const DB_NAME = dbNameMatch[1];

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

const SINCE = "datetime('now', '-7 days')";

function printTable(title: string, rows: Record<string, unknown>[]): void {
  console.log(`\n${title}`);
  if (rows.length === 0) {
    console.log("  (no rows)");
    return;
  }
  for (const row of rows) {
    console.log("  " + Object.values(row).map((v) => String(v)).join("  "));
  }
}

function main() {
  const totalsByName = query<{ name: string; n: number }>(
    `SELECT name, COUNT(*) AS n FROM analytics_events WHERE occurred_at >= ${SINCE} GROUP BY name ORDER BY n DESC`,
  );
  printTable("Total events by name (last 7 days)", totalsByName);

  const byContentType = query<{ name: string; content_type: string | null; n: number }>(
    `SELECT name, content_type, COUNT(*) AS n FROM analytics_events
     WHERE occurred_at >= ${SINCE} AND name IN ('landing', 'meaningful_content_view')
     GROUP BY name, content_type ORDER BY name, n DESC`,
  );
  printTable("landing / meaningful_content_view by content_type", byContentType);

  const byTargetType = query<{ target_content_type: string | null; n: number }>(
    `SELECT target_content_type, COUNT(*) AS n FROM analytics_events
     WHERE occurred_at >= ${SINCE} AND name = 'internal_discovery_click'
     GROUP BY target_content_type ORDER BY n DESC`,
  );
  printTable("internal_discovery_click by target_content_type", byTargetType);

  const signupStart = query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM analytics_events WHERE occurred_at >= ${SINCE} AND name = 'newsletter_signup_start'`,
  )[0]?.n ?? 0;
  const signupComplete = query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM analytics_events WHERE occurred_at >= ${SINCE} AND name = 'newsletter_signup_complete'`,
  )[0]?.n ?? 0;
  const conversionRate = signupStart > 0 ? ((signupComplete / signupStart) * 100).toFixed(1) : "0.0";
  console.log("\nNewsletter signup funnel (last 7 days)");
  console.log(`  newsletter_signup_start: ${signupStart}`);
  console.log(`  newsletter_signup_complete: ${signupComplete}`);
  console.log(`  conversion rate: ${conversionRate}%`);

  const byFranchise = query<{ franchise_id: string; n: number }>(
    `SELECT franchise_id, COUNT(*) AS n FROM analytics_events
     WHERE occurred_at >= ${SINCE} AND franchise_id IS NOT NULL
     GROUP BY franchise_id ORDER BY n DESC`,
  );
  printTable("Events by franchise_id (excluding nulls)", byFranchise);
}

main();
