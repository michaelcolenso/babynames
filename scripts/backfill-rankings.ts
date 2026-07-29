#!/usr/bin/env tsx
// Populates name_rankings_by_year (migration 0022) from the live name_years /
// names tables.
//
// Usage:
//   npm run backfill-rankings           # remote D1
//   npm run backfill-rankings:local     # local (wrangler) D1
//   npm run backfill-rankings -- --years=2024,2025
//
// Idempotent: each year is deleted and re-inserted, so re-running is safe and
// a partial run can simply be repeated.
//
// Readers gate on the `rankings_version` meta key rather than on the table's
// contents, so the half-built table this script walks through is never served:
// the marker is cleared up front and only stamped with the live `data_version`
// once every year has landed. A crashed run therefore leaves readers on the
// live query, not on partial rankings.
//
// Why not one big statement? Ranking every year in a single window function
// materializes all ~1.9M name_years rows at once and exceeds the memory budget
// D1 runs queries under (Cloudflare Error 1101). One statement per year keeps
// peak memory flat — the same reason the request-time queries in
// packages/shared/src/d1-queries.ts batch per year.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { rankingsRebuildSql, RANKINGS_PER_SEX_LIMIT } from "../packages/shared/src/rankings";
import { META_KEYS } from "../packages/shared/src/schema";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";
const yearsArg = process.argv.find((a) => a.startsWith("--years="));

// Years applied per wrangler invocation. Each year is still its own statement;
// this only amortizes process startup and the HTTP round-trip.
const YEARS_PER_CALL = 10;

function dbName(): string {
  const toml = readFileSync(CONFIG, "utf-8");
  const m = toml.match(/database_name\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`Could not find database_name in ${CONFIG}`);
  return m[1]!;
}

const DB = dbName();

function execute(sql: string, json: boolean): string {
  const args = [
    "wrangler",
    "d1",
    "execute",
    DB,
    "--config",
    CONFIG,
    target,
    "--yes",
    "--command",
    sql,
  ];
  if (json) args.push("--json");
  const res = spawnSync("npx", args, {
    cwd: REPO,
    encoding: "utf-8",
    stdio: json ? ["ignore", "pipe", "inherit"] : ["ignore", "inherit", "inherit"],
  });
  if (res.status !== 0) {
    throw new Error(`wrangler d1 execute failed (exit ${res.status})`);
  }
  return res.stdout ?? "";
}

function listYears(): number[] {
  if (yearsArg) {
    return yearsArg
      .slice("--years=".length)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
  }
  const out = execute("SELECT DISTINCT year FROM year_totals ORDER BY year", true);
  // wrangler --json emits [{ results: [...] }]; tolerate a bare results object,
  // and skip any non-JSON preamble wrangler prints before the payload.
  const start = out.search(/[[{]/);
  if (start < 0) throw new Error(`Unexpected wrangler output:\n${out}`);
  const parsed = JSON.parse(out.slice(start));
  const blocks = Array.isArray(parsed) ? parsed : [parsed];
  const years: number[] = [];
  for (const b of blocks) {
    for (const row of b.results ?? []) years.push(Number(row.year));
  }
  return years.filter((n) => Number.isInteger(n));
}

function setMarker(value: string) {
  const escaped = value.replace(/'/g, "''");
  execute(
    `INSERT INTO meta(key, value) VALUES('${META_KEYS.rankingsVersion}', '${escaped}') ` +
      `ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    false,
  );
}

function liveDataVersion(): string {
  const out = execute(`SELECT value FROM meta WHERE key = '${META_KEYS.dataVersion}'`, true);
  const start = out.search(/[[{]/);
  if (start < 0) throw new Error(`Unexpected wrangler output:\n${out}`);
  const parsed = JSON.parse(out.slice(start));
  const blocks = Array.isArray(parsed) ? parsed : [parsed];
  for (const b of blocks) {
    for (const row of b.results ?? []) if (row.value) return String(row.value);
  }
  return "";
}

function main() {
  const years = listYears();
  if (!years.length) {
    console.error("No years found — is year_totals populated on this database?");
    process.exit(1);
  }
  console.error(
    `Backfilling rankings for ${years.length} years (${years[0]}–${years[years.length - 1]}), ` +
      `top ${RANKINGS_PER_SEX_LIMIT} per sex, into ${DB} (${target}) …`,
  );

  // Partial-year backfills must not re-publish the marker: the rest of the
  // table is whatever the last full run left behind.
  const partial = !!yearsArg;
  const dataVersion = partial ? "" : liveDataVersion();
  if (!partial && !dataVersion) {
    console.error(
      "meta.data_version is empty — run an ingest first, or readers will never trust the cache.",
    );
    process.exit(1);
  }
  if (!partial) setMarker("");

  const { del, ins } = rankingsRebuildSql();
  for (let i = 0; i < years.length; i += YEARS_PER_CALL) {
    const slice = years.slice(i, i + YEARS_PER_CALL);
    // --command takes literal SQL, so the per-year binds are inlined. Years are
    // integers validated above, so there is nothing to escape.
    const sql = slice
      .flatMap((y) => [
        del.replace("?1", String(y)),
        ins.replace(/\?1/g, String(y)).replace("?2", String(RANKINGS_PER_SEX_LIMIT)),
      ])
      .map((s) => s.trim().replace(/;?$/, ";"))
      .join("\n");
    execute(sql, false);
    console.error(`  … ${slice[0]}–${slice[slice.length - 1]} done`);
  }
  if (partial) {
    console.error(
      "Done (partial run — readiness marker untouched; run without --years to publish a full rebuild).",
    );
  } else {
    setMarker(dataVersion);
    console.error(`Done — published for data_version ${dataVersion}.`);
  }
}

main();
