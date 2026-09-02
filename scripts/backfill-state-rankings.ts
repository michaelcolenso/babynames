#!/usr/bin/env tsx
// Populates state_year_rankings + state_year_totals (migration 0024) from the
// live name_states table.
//
// Usage:
//   npm run backfill-state-rankings           # remote D1
//   npm run backfill-state-rankings:local     # local (wrangler) D1
//   npm run backfill-state-rankings -- --years=2023,2024
//   npm run backfill-state-rankings -- --states=CA,TX
//
// Idempotent: each (state, year) is deleted and re-inserted, so re-running is
// safe and a partial run can simply be repeated.
//
// Readers gate on the `state_rankings_version` meta key rather than on the
// tables' contents, so the half-built tables this script walks through are
// never served: the marker is cleared up front and only stamped with the live
// `data_version` once every (state, year) pair has landed. A crashed run
// therefore leaves readers on the live query, not on partial rankings.
//
// Why not one big statement? Ranking every state-year in a single window
// function materializes all ~6.6M name_states rows at once and exceeds the
// memory budget D1 runs queries under (Cloudflare Error 1101). One statement
// per (state, year) keeps peak memory flat — the same reason the national
// backfill batches per year.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  STATE_RANKINGS_PER_SEX_LIMIT,
  stateRankingsRebuildSql,
} from "../packages/shared/src/state-rankings";
import { ALL_STATES } from "../packages/shared/src/us-states-map";
import { META_KEYS } from "../packages/shared/src/schema";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";
const yearsArg = process.argv.find((a) => a.startsWith("--years="));
const statesArg = process.argv.find((a) => a.startsWith("--states="));

// (state, year) pairs applied per wrangler invocation. Each pair is still its
// own set of statements; this only amortizes process startup and round-trips.
const PAIRS_PER_CALL = 10;

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

function parseJsonOutput(out: string): Array<{ results?: Array<Record<string, unknown>> }> {
  const start = out.search(/[[{]/);
  if (start < 0) throw new Error(`Unexpected wrangler output:\n${out}`);
  const parsed = JSON.parse(out.slice(start));
  return Array.isArray(parsed) ? parsed : [parsed];
}

function listStates(): string[] {
  if (statesArg) {
    return statesArg
      .slice("--states=".length)
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => (ALL_STATES as readonly string[]).includes(s));
  }
  return [...ALL_STATES];
}

function listYears(states: string[]): number[] {
  if (yearsArg) {
    return yearsArg
      .slice("--years=".length)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
  }
  // Years present for the states being rebuilt (usually all 51 of them).
  const quoted = states.map((s) => `'${s}'`).join(",");
  const out = execute(
    `SELECT DISTINCT year FROM name_states WHERE state IN (${quoted}) ORDER BY year`,
    true,
  );
  const years: number[] = [];
  for (const b of parseJsonOutput(out)) {
    for (const row of b.results ?? []) years.push(Number(row.year));
  }
  return years.filter((n) => Number.isInteger(n));
}

function setMarker(value: string) {
  const escaped = value.replace(/'/g, "''");
  execute(
    `INSERT INTO meta(key, value) VALUES('${META_KEYS.stateRankingsVersion}', '${escaped}') ` +
      `ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    false,
  );
}

function liveDataVersion(): string {
  const out = execute(`SELECT value FROM meta WHERE key = '${META_KEYS.dataVersion}'`, true);
  for (const b of parseJsonOutput(out)) {
    for (const row of b.results ?? []) if (row.value) return String(row.value);
  }
  return "";
}

function main() {
  const states = listStates();
  const years = listYears(states);
  if (!states.length || !years.length) {
    console.error("No state/year pairs found — is name_states populated on this database?");
    process.exit(1);
  }
  const pairs: Array<{ state: string; year: number }> = [];
  for (const state of states) for (const year of years) pairs.push({ state, year });
  console.error(
    `Backfilling state rankings for ${states.length} states × ${years.length} years ` +
      `(${years[0]}–${years[years.length - 1]}), top ${STATE_RANKINGS_PER_SEX_LIMIT} per sex, ` +
      `into ${DB} (${target}) — ${pairs.length} pairs …`,
  );

  // Partial backfills must not re-publish the marker: the rest of the tables
  // are whatever the last full run left behind.
  const partial = !!yearsArg || !!statesArg;
  const dataVersion = partial ? "" : liveDataVersion();
  if (!partial && !dataVersion) {
    console.error(
      "meta.data_version is empty — run an ingest first, or readers will never trust the cache.",
    );
    process.exit(1);
  }
  if (!partial) setMarker("");

  const { del, ins, totalsDel, totalsIns } = stateRankingsRebuildSql();
  for (let i = 0; i < pairs.length; i += PAIRS_PER_CALL) {
    const slice = pairs.slice(i, i + PAIRS_PER_CALL);
    // --command takes literal SQL, so the per-pair binds are inlined. States
    // come from ALL_STATES and years are validated integers, so there is
    // nothing to escape.
    const sql = slice
      .flatMap(({ state, year }) => [
        del.replace("?1", `'${state}'`).replace("?2", String(year)),
        ins.replace("?1", `'${state}'`).replace("?2", String(year)).replace("?3", String(STATE_RANKINGS_PER_SEX_LIMIT)),
        totalsDel.replace("?1", `'${state}'`).replace("?2", String(year)),
        totalsIns.replace("?1", `'${state}'`).replace("?2", String(year)),
      ])
      .map((s) => s.trim().replace(/;?$/, ";"))
      .join("\n");
    execute(sql, false);
    const first = slice[0]!;
    const last = slice[slice.length - 1]!;
    console.error(`  … ${first.state} ${first.year} → ${last.state} ${last.year} done (${Math.min(i + PAIRS_PER_CALL, pairs.length)}/${pairs.length})`);
  }
  if (partial) {
    console.error(
      "Done (partial run — readiness marker untouched; run without --years/--states to publish a full rebuild).",
    );
  } else {
    setMarker(dataVersion);
    console.error(`Done — published for data_version ${dataVersion}.`);
  }
}

main();
