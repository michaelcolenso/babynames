#!/usr/bin/env tsx
// Builds the 1980s decade hub payload (SPEC §1).
//
// SOURCE DATA DECISION (documented per SPEC §1):
// - The shipped artifact is built from the live `name-vitals` D1 database,
//   which the ingest worker populates from the official SSA national zip. It
//   is the newest vintage available to this project (records through 2025).
// - The tracked shards in viz/name-vitals/data/ are a frozen 2017-vintage
//   snapshot and remain available as an offline fallback, but they must not be
//   the shipped source while D1 is reachable: lifetime-based measures (the
//   ownership score above all) are wrong when a name's recorded history is
//   truncated eight years early.
// - ssa.gov is unreachable from the authoring sandbox (Akamai "Access Denied"),
//   so `auto` prefers D1 and falls back to a local zip, then the shards.
//
// Usage (the parser only accepts the equals form):
//   npx tsx scripts/build-decade-hub.ts                      # --source=auto
//   npx tsx scripts/build-decade-hub.ts --source=d1          # live D1 (remote)
//   npx tsx scripts/build-decade-hub.ts --source=shards      # tracked shards
//   npx tsx scripts/build-decade-hub.ts --source=zip         # fetch SSA zip
//   npx tsx scripts/build-decade-hub.ts --zip=./names.zip    # local SSA zip
//
// --source=d1 reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from the
// environment and queries the D1 HTTP API directly (read-only SELECTs).
//
// Output:
//   data/dist/decade-hub-1980.sql  (INSERT OR REPLACE into decade_hub)
//   data/dist/decade-hub-1980.json (same payload, pretty, for inspection/tests)
//   stdout summary for the PR note

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { unzipSync } from "fflate";

import type { DecadeHubSource, SourceNameRecord } from "../packages/shared/src/decade-hub-compute";
import {
  DECADE_HUB_ALPHA,
  assertSanityAnchors,
  buildDecadeProfile,
  stableStringify,
} from "../packages/shared/src/decade-hub-compute";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";

const REPO = path.resolve(import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)), "..");
const SHARD_DIR = path.join(REPO, "viz/name-vitals/data");
const RAW_ZIP_DIR = path.join(REPO, "data/raw/ssa-national");
const FAMILIES_CSV = path.join(REPO, "data/manual/spelling-families.csv");
const OUT_DIR = path.join(REPO, "data/dist");
const SSA_URL = "https://www.ssa.gov/oact/babynames/names.zip";

export interface LoadedSource {
  source: DecadeHubSource;
  sourceVersion: string;
  sourceLabel: string; // how the source was resolved (printed + reported)
}

// ---------------------------------------------------------------------------
// tracked shards (SPEC §1 fallback; format per scripts/seed-from-shards.ts)
// ---------------------------------------------------------------------------

interface ShardMeta {
  ym: number;
  yM: number;
  totalsByYear: Record<string, { M: number; F: number }>;
}

interface ShardFile {
  ym: number;
  yM: number;
  n: Record<string, number[]>;
}

export async function loadShardSource(shardDir = SHARD_DIR): Promise<LoadedSource> {
  const meta = JSON.parse(await fs.readFile(path.join(shardDir, "meta.json"), "utf8")) as ShardMeta;
  const namesDir = path.join(shardDir, "names");
  const letters = (await fs.readdir(namesDir)).filter((f) => f.endsWith(".json")).sort();
  if (letters.length < 26) throw new Error(`incomplete shards: only ${letters.length} letter files in ${namesDir}`);

  const records: SourceNameRecord[] = [];
  for (const letter of letters) {
    const shard = JSON.parse(await fs.readFile(path.join(namesDir, letter), "utf8")) as ShardFile;
    for (const [key, arr] of Object.entries(shard.n)) {
      const pipe = key.lastIndexOf("|");
      const name = key.slice(0, pipe);
      const sex = key.slice(pipe + 1);
      if (sex !== "M" && sex !== "F") continue;
      const firstYear = arr[0]!;
      const series: Record<number, number> = {};
      for (let i = 1; i < arr.length; i++) {
        const v = arr[i]!;
        if (v > 0) series[firstYear + i - 1] = v;
      }
      records.push({ name, sex, series });
    }
  }
  if (!records.length) throw new Error("no (name, sex) records loaded from shards");

  // internal consistency: shard series sums must match meta.totalsByYear
  const sums = new Map<string, number>();
  for (const rec of records) {
    for (const [yearStr, count] of Object.entries(rec.series)) {
      const k = `${yearStr}:${rec.sex}`;
      sums.set(k, (sums.get(k) ?? 0) + count);
    }
  }
  for (const [yearStr, totals] of Object.entries(meta.totalsByYear)) {
    for (const sex of ["M", "F"] as const) {
      const got = sums.get(`${yearStr}:${sex}`) ?? 0;
      const want = totals[sex];
      if (got !== want) {
        throw new Error(`shard/meta mismatch ${yearStr} ${sex}: series sum ${got} != meta ${want}`);
      }
    }
  }

  sortRecords(records);
  return {
    source: { minYear: meta.ym, maxYear: meta.yM, records },
    sourceVersion: `ssa-national-${meta.yM}`,
    sourceLabel: `tracked shards viz/name-vitals/data (ssa-national-${meta.yM})`,
  };
}

// ---------------------------------------------------------------------------
// official SSA national names zip (fetch/parse mirrors scripts/ingest-ssa.ts)
// ---------------------------------------------------------------------------

export async function loadZipSource(zipPath?: string): Promise<LoadedSource> {
  let zipBytes: Uint8Array;
  let label: string;
  if (zipPath) {
    zipBytes = new Uint8Array(await fs.readFile(zipPath));
    label = `local SSA zip ${zipPath}`;
  } else {
    // fetch exactly like scripts/ingest-ssa.ts does
    const res = await fetch(SSA_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; name-vitals-ingest/1.0; +https://github.com/michaelcolenso/babynames)",
        Accept: "application/zip, application/octet-stream, */*",
      },
    });
    if (!res.ok) throw new Error(`SSA fetch failed: ${res.status} ${res.statusText}`);
    zipBytes = new Uint8Array(await res.arrayBuffer());
    label = `SSA zip ${SSA_URL}`;
  }

  const YOB_RE = /^yob(\d{4})\.txt$/i;
  const files = unzipSync(zipBytes);
  const dec = new TextDecoder("utf-8");
  const yobs: { year: number; text: string }[] = [];
  for (const [filePath, data] of Object.entries(files)) {
    const base = filePath.split("/").pop() ?? "";
    const m = YOB_RE.exec(base);
    if (!m) continue;
    yobs.push({ year: Number(m[1]), text: dec.decode(data) });
  }
  yobs.sort((a, b) => a.year - b.year);
  if (!yobs.length) throw new Error("no yob*.txt files found in zip");

  const byKey = new Map<string, SourceNameRecord>();
  for (const yob of yobs) {
    for (const rawLine of yob.text.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(",");
      if (parts.length !== 3) continue;
      const name = parts[0]!.trim();
      const sex = parts[1]!.trim();
      const count = Number(parts[2]!.trim());
      if (!name || (sex !== "M" && sex !== "F") || !Number.isFinite(count) || count <= 0) continue;
      const key = name + "|" + sex;
      let r = byKey.get(key);
      if (!r) {
        r = { name, sex, series: {} };
        byKey.set(key, r);
      }
      r.series[yob.year] = count;
    }
  }
  const records = [...byKey.values()];
  sortRecords(records);
  const ym = yobs[0]!.year;
  const yM = yobs[yobs.length - 1]!.year;
  return {
    source: { minYear: ym, maxYear: yM, records },
    sourceVersion: `ssa-national-${yM}`,
    sourceLabel: `${label} (ssa-national-${yM})`,
  };
}

// ---------------------------------------------------------------------------
// live D1 (`name-vitals`) — the shipped source
// ---------------------------------------------------------------------------

const D1_DATABASE_ID = "fc4741db-1f6d-457c-b4e4-675a4ea3ebc2"; // name-vitals (apps/web/wrangler.toml)
const D1_ID_CHUNK = 2000; // names per request; keeps each response well under the API's response cap

interface D1QueryResponse<Row> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: { results: Row[] }[];
}

async function d1Query<Row>(sql: string, params: string[] = []): Promise<Row[]> {
  // trim: these are commonly injected with stray surrounding whitespace, which
  // silently turns into a bad URL path / bad bearer header.
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error("--source=d1 requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const body = (await res.json()) as D1QueryResponse<Row>;
  if (!res.ok || !body.success) {
    const detail = body.errors?.map((e) => `${e.code} ${e.message}`).join("; ") ?? `${res.status} ${res.statusText}`;
    throw new Error(`D1 query failed: ${detail}`);
  }
  return body.result?.[0]?.results ?? [];
}

/**
 * Loads every (name, sex) series from the live D1 database.
 *
 * The yearly series is fetched as one `year:count` group_concat per name so the
 * ~2.2M `name_years` rows arrive as ~118k rows instead. Paging is by `names.id`
 * range rather than LIMIT/OFFSET so each request reads only its own slice.
 */
export async function loadD1Source(): Promise<LoadedSource> {
  const [bounds] = await d1Query<{ min_id: number; max_id: number; min_year: number; max_year: number }>(
    "SELECT MIN(id) AS min_id, MAX(id) AS max_id, (SELECT MIN(year) FROM name_years) AS min_year, (SELECT MAX(year) FROM name_years) AS max_year FROM names",
  );
  if (!bounds || bounds.max_id == null) throw new Error("D1 `names` table is empty");

  const records: SourceNameRecord[] = [];
  for (let lo = bounds.min_id; lo <= bounds.max_id; lo += D1_ID_CHUNK) {
    const hi = lo + D1_ID_CHUNK - 1;
    const rows = await d1Query<{ name: string; sex: string; series: string | null }>(
      "SELECT n.name AS name, n.sex AS sex, group_concat(y.year || ':' || y.count) AS series " +
        "FROM names n JOIN name_years y ON y.name_id = n.id " +
        "WHERE n.id >= ?1 AND n.id <= ?2 GROUP BY n.id",
      [String(lo), String(hi)],
    );
    for (const row of rows) {
      if (row.sex !== "M" && row.sex !== "F") continue;
      const series: Record<number, number> = {};
      for (const pair of (row.series ?? "").split(",")) {
        if (!pair) continue;
        const colon = pair.indexOf(":");
        const year = Number(pair.slice(0, colon));
        const count = Number(pair.slice(colon + 1));
        if (!Number.isFinite(year) || !Number.isFinite(count) || count <= 0) continue;
        series[year] = count;
      }
      if (Object.keys(series).length) records.push({ name: row.name, sex: row.sex, series });
    }
    console.error(`  d1: ids ${lo}–${hi} → ${records.length} records so far`);
  }
  if (!records.length) throw new Error("no (name, sex) records loaded from D1");

  // internal consistency: per-year series sums must match the year_totals table
  const totals = await d1Query<{ year: number; sex: string; total: number }>("SELECT year, sex, total FROM year_totals");
  const sums = new Map<string, number>();
  for (const rec of records) {
    for (const [yearStr, count] of Object.entries(rec.series)) {
      const k = `${yearStr}:${rec.sex}`;
      sums.set(k, (sums.get(k) ?? 0) + count);
    }
  }
  // `year_totals` is a denormalized rollup maintained by the ingest worker and
  // can lag `name_years` by a few suppressed-threshold names (observed drift:
  // 281 births across 38 of 292 year/sex pairs, max 25). `name_years` is the
  // granular truth and is what the payload sums, so treat a small drift as
  // informational and fail only on a real divergence.
  let driftPairs = 0;
  let driftBirths = 0;
  for (const t of totals) {
    const got = sums.get(`${t.year}:${t.sex}`) ?? 0;
    const diff = Math.abs(got - t.total);
    if (diff === 0) continue;
    const tolerance = Math.max(50, t.total * 1e-4);
    if (diff > tolerance) {
      throw new Error(`d1/year_totals mismatch ${t.year} ${t.sex}: series sum ${got} vs year_totals ${t.total} (diff ${diff} > tolerance ${Math.round(tolerance)})`);
    }
    driftPairs += 1;
    driftBirths += diff;
  }
  if (driftPairs) {
    console.error(`  d1: year_totals rollup drift on ${driftPairs} year/sex pairs, ${driftBirths} births total (within tolerance; name_years used)`);
  }

  sortRecords(records);
  return {
    source: { minYear: bounds.min_year, maxYear: bounds.max_year, records },
    sourceVersion: `ssa-national-${bounds.max_year}`,
    sourceLabel: `live D1 name-vitals (ssa-national-${bounds.max_year})`,
  };
}

function sortRecords(records: SourceNameRecord[]): void {
  records.sort((a, b) =>
    a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : a.sex < b.sex ? -1 : 1,
  );
}

// ---------------------------------------------------------------------------
// source resolution: --source shards|zip|auto (default auto)
// ---------------------------------------------------------------------------

export async function resolveSource(): Promise<LoadedSource> {
  const sourceArg = process.argv.find((a) => a.startsWith("--source="))?.slice("--source=".length) ?? "auto";
  const zipArg = process.argv.find((a) => a.startsWith("--zip="))?.slice("--zip=".length);
  if (zipArg) return loadZipSource(zipArg);
  if (sourceArg === "d1") return loadD1Source();
  if (sourceArg === "shards") return loadShardSource();
  if (sourceArg === "zip") return loadZipSource(await findLocalZip());
  if (sourceArg !== "auto") throw new Error(`unknown --source=${sourceArg} (expected d1|shards|zip|auto)`);
  // auto: prefer live D1 (newest vintage), then a local zip, then ssa.gov, else
  // the frozen 2017 shards.
  try {
    return await loadD1Source();
  } catch (err) {
    console.error(`D1 unavailable (${(err as Error).message}); trying zip sources`);
  }
  const localZip = await findLocalZip();
  if (localZip) return loadZipSource(localZip);
  try {
    return await loadZipSource();
  } catch (err) {
    console.error(`ssa.gov unreachable (${(err as Error).message}); falling back to tracked shards`);
    return loadShardSource();
  }
}

async function findLocalZip(): Promise<string | undefined> {
  try {
    const entries = await fs.readdir(RAW_ZIP_DIR);
    const zip = entries.find((e) => e.endsWith(".zip"));
    return zip ? path.join(RAW_ZIP_DIR, zip) : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// SQL + summary output
// ---------------------------------------------------------------------------

export function profileToSql(profile: DecadeProfile): string {
  const payload = stableStringify(profile).replace(/'/g, "''");
  return (
    "INSERT OR REPLACE INTO decade_hub(decade,methodology_version,source_version,generated_at,payload) VALUES(" +
    `'${profile.decade}s',` +
    `'${profile.methodologyVersion}',` +
    `'${profile.sourceVersion}',` +
    `'${profile.generatedAt}',` +
    `'${payload}');\n`
  );
}

async function main() {
  const { source, sourceVersion, sourceLabel } = await resolveSource();
  console.error(`source: ${source.records.length} (name, sex) records, ${source.minYear}–${source.maxYear} — ${sourceLabel}`);

  const anchors = assertSanityAnchors(source);
  console.error(
    `sanity anchors ok: 1984 total ${anchors.totalBirths1984.toLocaleString("en-US")}, ` +
      `Michael M 1984 ${anchors.michaelM1984.toLocaleString("en-US")}, ` +
      `Jennifer F 1980s ${anchors.jenniferF1980s.toLocaleString("en-US")}`,
  );

  const familiesCsv = await fs.readFile(FAMILIES_CSV, "utf8");
  const generatedAt = new Date().toISOString();
  // gitCommit intentionally left undefined: this checkout comes from a codeload
  // tarball with no .git directory, so no commit hash is available.
  const profile = buildDecadeProfile({ source, alpha: DECADE_HUB_ALPHA, familiesCsv, generatedAt, sourceVersion });

  await fs.mkdir(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, "decade-hub-1980.json");
  const sqlPath = path.join(OUT_DIR, "decade-hub-1980.sql");
  await fs.writeFile(jsonPath, stableStringify(profile, true) + "\n");
  await fs.writeFile(sqlPath, profileToSql(profile));

  // --- stdout summary (for the PR note) ---
  const fmt = (n: number) => n.toLocaleString("en-US");
  const line = (r: { ownershipRank: number; name: string; ownershipScore: number; birthsInDecade: number; popularityRank: number }) =>
    `  ${String(r.ownershipRank).padStart(2)}. ${r.name.padEnd(14)} score ${r.ownershipScore.toFixed(2).padStart(6)}  ` +
    `births ${fmt(r.birthsInDecade).padStart(8)}  popularity rank ${r.popularityRank}`;

  console.log(`# Decade hub build summary — 1980s`);
  console.log(`source: ${sourceLabel}`);
  console.log(`generatedAt: ${generatedAt}   alpha: ${profile.alpha}   methodology: ${profile.methodologyVersion}`);
  console.log(`priors: F ${profile.priorDecadeShareFemale}  M ${profile.priorDecadeShareMale}  pooled ${profile.priorDecadeShare}`);
  console.log(`total births: ${fmt(profile.totalBirths)} (F ${fmt(profile.femaleBirths)} / M ${fmt(profile.maleBirths)})`);
  console.log(`distinct name+sex rows: ${fmt(profile.distinctNames)}`);
  console.log(`top10 share: ${(profile.top10Share * 100).toFixed(2)}%   top100 share: ${(profile.top100Share * 100).toFixed(2)}%`);
  console.log(`diversity score: ${profile.diversityScore}   effective names: ${fmt(profile.effectiveNames)}   concentration score: ${profile.concentrationScore}`);
  console.log(`eligible sets: F ${profile.ownershipRankings.female.length}, M ${profile.ownershipRankings.male.length}`);
  console.log(`champions: F ${profile.femaleChampion.name} (${fmt(profile.femaleChampion.birthsInDecade)}), M ${profile.maleChampion.name} (${fmt(profile.maleChampion.birthsInDecade)})`);
  console.log(`\nTop 10 ownership — girls:`);
  for (const r of profile.ownershipRankings.female.slice(0, 10)) console.log(line(r));
  console.log(`\nTop 10 ownership — boys:`);
  for (const r of profile.ownershipRankings.male.slice(0, 10)) console.log(line(r));
  console.log(`\nMost Owned (pooled, top 5): ${profile.ownershipRankings.mostOwned.slice(0, 5).map((r) => `${r.name} (${r.sex})`).join(", ")}`);
  console.log(`Most Popular (pooled, top 5): ${profile.ownershipRankings.mostPopular.slice(0, 5).map((r) => `${r.name} (${r.sex})`).join(", ")}`);
  console.log(`Popular but Timeless (top 5): ${profile.ownershipRankings.popularButTimeless.slice(0, 5).map((r) => `${r.name} (${r.sex})`).join(", ")}`);
  console.log(`Unexpected (top 5): ${profile.ownershipRankings.unexpected.slice(0, 5).map((r) => `${r.name} (${r.sex}, Δ${r.popularityRank - r.ownershipRank})`).join(", ")}`);
  const cr = profile.classroomDefaults;
  console.log(`\nClassroom 1984: ${cr.femaleSeats}F/${cr.maleSeats}M seats, ${cr.uniqueNames} unique names, ${cr.repeatedNames} repeats, most repeated ${cr.mostRepeated.name} ×${cr.mostRepeated.seats}`);
  console.log(`spelling families shipped: ${profile.spellingFamilies.map((f) => `${f.id} (${fmt(f.totalBirthsInDecade)}, combined rank ${f.combinedDecadeRank})`).join(", ")}`);
  console.log(`\nwrote ${path.relative(process.cwd(), jsonPath)} and ${path.relative(process.cwd(), sqlPath)}`);
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedAs && invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
