#!/usr/bin/env tsx
// Spot-checks API responses from the new Cloudflare Pages deployment against
// the legacy JSON shards to verify data parity before DNS cutover.
//
// Usage:
//   tsx scripts/verify-parity.ts --base=https://<preview>.pages.dev
//   tsx scripts/verify-parity.ts --base=https://<preview>.pages.dev --verbose

import fs from "node:fs/promises";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const DATA_DIR = path.join(REPO, "viz/name-vitals/data");
const NAMES_DIR = path.join(DATA_DIR, "names");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k!, v ?? "true"];
  }),
);
const BASE = (args["base"] ?? "").replace(/\/$/, "");
const VERBOSE = args["verbose"] === "true";

if (!BASE) {
  console.error("Usage: tsx scripts/verify-parity.ts --base=https://<host>");
  process.exit(1);
}

interface ShardEntry { ym: number; yM: number; n: Record<string, number[]> }
interface ApiNameRecord {
  name: string; sex: string; ym: number; yM: number;
  series: Record<string, number>;
}
interface LandingRow { name: string; sex: string }
interface LandingResponse { yM: number; rows: LandingRow[] }

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, "utf8")) as T;
}

function entryToSeries(arr: number[]): Record<number, number> {
  const firstYear = arr[0]!;
  const out: Record<number, number> = {};
  for (let i = 1; i < arr.length; i++) {
    const v = arr[i]!;
    if (v > 0) out[firstYear + i - 1] = v;
  }
  return out;
}

let passed = 0, failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
    if (VERBOSE) console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
    if (VERBOSE) {
      console.error("    expected:", JSON.stringify(expected));
      console.error("    actual  :", JSON.stringify(actual));
    }
  }
}

async function verifyName(name: string, sex: "M" | "F", shard: ShardEntry) {
  const key = `${name}|${sex}`;
  const arr = shard.n[key];
  if (!arr) return; // name not in this shard, skip.

  const url = `${BASE}/api/name/${encodeURIComponent(name)}`;
  let rec: ApiNameRecord;
  try {
    const r = await fetch(url);
    if (r.status === 404) {
      console.error(`  ✗ ${name}|${sex}: API returned 404`);
      failed++;
      return;
    }
    rec = await r.json() as ApiNameRecord;
  } catch (err) {
    console.error(`  ✗ ${name}|${sex}: fetch error – ${err}`);
    failed++;
    return;
  }

  const legacySeries = entryToSeries(arr);
  const legacyYears = Object.keys(legacySeries).map(Number).sort((a, b) => a - b);
  const legacyFirst = legacyYears[0]!;
  const legacyLast = legacyYears[legacyYears.length - 1]!;

  const apiSex = rec.sex === sex ? rec : null;
  if (!apiSex) {
    console.error(`  ✗ ${name}|${sex}: sex mismatch (got ${rec.sex})`);
    failed++;
    return;
  }

  const apiSeries = rec.series;
  const apiYears = Object.keys(apiSeries).map(Number).sort((a, b) => a - b);

  check(`${name}|${sex} firstYear`, apiYears[0], legacyFirst);
  check(`${name}|${sex} lastYear`, apiYears[apiYears.length - 1], legacyLast);

  const legacyPeak = legacyYears.reduce((best, y) => (legacySeries[y]! > (legacySeries[best] ?? 0) ? y : best), legacyYears[0]!);
  const apiPeak = apiYears.reduce((best, y) => (apiSeries[y]! > (apiSeries[best] ?? 0) ? y : best), apiYears[0]!);
  check(`${name}|${sex} peakYear`, apiPeak, legacyPeak);
  check(`${name}|${sex} peakCount`, apiSeries[apiPeak], legacySeries[legacyPeak]);
}

async function verifyLanding(kind: "extinct" | "endangered" | "rising") {
  const url = `${BASE}/api/landing/${kind}`;
  const r = await fetch(url);
  const api = await r.json() as LandingResponse;
  const legacy = await readJson<{ rows: LandingRow[] }>(path.join(DATA_DIR, `landing/${kind}.json`));

  const apiSet = new Set(api.rows.map((r) => `${r.name}|${r.sex}`));
  const legacySet = new Set(legacy.rows.map((r) => `${r.name}|${r.sex}`));

  const onlyInLegacy = [...legacySet].filter((k) => !apiSet.has(k));
  const onlyInApi = [...apiSet].filter((k) => !legacySet.has(k));

  if (onlyInLegacy.length === 0 && onlyInApi.length === 0) {
    passed++;
    console.log(`  ✓ landing/${kind}: ${api.rows.length} rows match`);
  } else {
    failed++;
    console.error(`  ✗ landing/${kind}: ${onlyInLegacy.length} missing from API, ${onlyInApi.length} extra in API`);
    if (VERBOSE && onlyInLegacy.length) console.error("    missing:", onlyInLegacy.slice(0, 10));
    if (VERBOSE && onlyInApi.length) console.error("    extra:", onlyInApi.slice(0, 10));
  }
}

async function main() {
  console.log(`Verifying parity against ${BASE}`);

  // Gate A: aggregates
  console.log("\n[A] Meta aggregates");
  const metaR = await fetch(`${BASE}/api/meta`);
  const apiMeta = await metaR.json() as { ym: number; yM: number; totalNames: number; totalRows: number };
  const legacyMeta = await readJson<{ ym: number; yM: number; totalNames: number; totalRows: number }>(path.join(DATA_DIR, "meta.json"));
  check("ym", apiMeta.ym, legacyMeta.ym);
  check("yM", apiMeta.yM, legacyMeta.yM);
  // Allow a bit of slack on totalNames/totalRows since the DB may have newer SSA data.
  const nameDelta = Math.abs(apiMeta.totalNames - legacyMeta.totalNames) / legacyMeta.totalNames;
  const rowDelta = Math.abs(apiMeta.totalRows - legacyMeta.totalRows) / legacyMeta.totalRows;
  check("totalNames within 5%", nameDelta < 0.05, true);
  check("totalRows within 5%", rowDelta < 0.05, true);

  // Gate B: per-name spot checks
  console.log("\n[B] Per-name spot checks");
  const letters = await fs.readdir(NAMES_DIR);
  // Top 50 names by peak (approximated by scanning one full shard)
  const aShardPath = path.join(NAMES_DIR, "A.json");
  const aShard = await readJson<ShardEntry>(aShardPath);
  const spotNames: Array<[string, "M" | "F"]> = [
    // Canonical high-volume names
    ["Mary", "F"], ["John", "M"], ["Emma", "F"], ["James", "M"],
    ["Dorothy", "F"], ["Robert", "M"], ["Patricia", "F"], ["Michael", "M"],
    ["Margaret", "F"], ["William", "M"],
    // Edge cases
    ["Bo", "M"], ["Al", "M"],
    ["Jordan", "M"], ["Jordan", "F"],
    // Randomly sample A shard
    ...Object.keys(aShard.n).slice(0, 20).map((k) => {
      const [n, s] = k.split("|") as [string, "M" | "F"];
      return [n, s] as [string, "M" | "F"];
    }),
  ];
  // Load the shards we need
  const shardCache = new Map<string, ShardEntry>();
  const getShard = async (name: string) => {
    const ch = name[0]!.toUpperCase();
    const letter = ch >= "A" && ch <= "Z" ? `${ch}.json` : "_.json";
    if (!shardCache.has(letter)) {
      try {
        shardCache.set(letter, await readJson<ShardEntry>(path.join(NAMES_DIR, letter)));
      } catch { return null; }
    }
    return shardCache.get(letter)!;
  };

  for (const [name, sex] of spotNames) {
    const shard = await getShard(name);
    if (!shard) continue;
    await verifyName(name, sex, shard);
  }

  // Gate C: landing pages
  console.log("\n[C] Landing list parity");
  await verifyLanding("extinct");
  await verifyLanding("endangered");
  await verifyLanding("rising");

  // Summary
  const total = passed + failed;
  console.log(`\n${passed}/${total} checks passed${failed > 0 ? ` — ${failed} FAILED` : ""}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
