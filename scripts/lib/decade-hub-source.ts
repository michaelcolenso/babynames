#!/usr/bin/env tsx
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";


import { unzipSync } from "fflate";
import { ProxyAgent } from "undici";

import type { DecadeHubSource, SourceNameRecord } from "../../packages/shared/src/decade-hub-compute";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHARD_DIR = path.join(REPO, "viz/name-vitals/data");
const RAW_ZIP_DIR = path.join(REPO, "data/raw/ssa-national");
const FAMILIES_CSV = path.join(REPO, "data/manual/spelling-families.csv");
const OUT_DIR = path.join(REPO, "data/dist");
const SSA_URL = "https://www.ssa.gov/oact/babynames/names.zip";

export interface LoadedSource {
  source: DecadeHubSource;
  sourceVersion: string;
  sourceLabel: string; // how the source was resolved (printed + reported)
  sourceType: "d1" | "sqlite" | "zip" | "shards";
  fingerprint: string;
  validationOnly: boolean;
}

export function sourceFingerprint(version: string, records: SourceNameRecord[], ids?: Map<string, number>): string {
  let sumTotal = 0;
  let idWeighted = 0;
  const digest = createHash("sha256");
  for (const rec of records) {
    const total = Object.values(rec.series).reduce((sum, value) => sum + value, 0);
    const id = ids?.get(`${rec.name}|${rec.sex}`) ?? 0;
    sumTotal += total;
    idWeighted += id * total;
    digest.update(`${id}\0${rec.name}\0${rec.sex}\0`);
    for (const [year, count] of Object.entries(rec.series).sort(([a], [b]) => Number(a) - Number(b))) digest.update(`${year}:${count},`);
    digest.update("\n");
  }
  return `${version}|${records.length}|${sumTotal}|${idWeighted}|sha256:${digest.digest("hex")}`;
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
    sourceType: "shards",
    fingerprint: sourceFingerprint(`ssa-national-${meta.yM}`, records),
    validationOnly: true,
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
    sourceType: "zip",
    fingerprint: sourceFingerprint(`ssa-national-${yM}`, records),
    validationOnly: false,
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

export async function d1Query<Row>(sql: string, params: string[] = []): Promise<Row[]> {
  // trim: these are commonly injected with stray surrounding whitespace, which
  // silently turns into a bad URL path / bad bearer header.
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error("--source=d1 requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`;
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
    ...(dispatcher ? { dispatcher } : {}),
  });
  const body = (await res.json()) as D1QueryResponse<Row>;
  if (!res.ok || !body.success) {
    const detail = body.errors?.map((e) => `${e.code} ${e.message}`).join("; ") ?? `${res.status} ${res.statusText}`;
    throw new Error(`D1 query failed: ${detail}`);
  }
  return body.result?.[0]?.results ?? [];
}

/**
 * A D1 read that reached the database but came back untrustworthy — a torn
 * scan, or sums that disagree with `year_totals` beyond tolerance.
 *
 * This is deliberately distinct from an availability or credential failure.
 * `--source=auto` may fall back to another source when D1 is simply out of
 * reach, but an integrity failure means the data we did read is wrong, and
 * silently substituting the frozen 2017 shards would turn "re-run the build"
 * into a stale artifact that looks fresh.
 */
export class D1IntegrityError extends Error {
  override readonly name = "D1IntegrityError";
}

/**
 * A marker for "the live tables have not changed under us".
 *
 * `meta.data_version` alone is not sufficient. The ingest worker's `finalize()`
 * commits the staging->live rename and only afterwards writes the meta keys in
 * a separate statement (apps/ingest-worker/src/index.ts), so there is a window
 * where the tables are new but `data_version` is still the old UUID — a scan
 * straddling that window would read both UUIDs as equal.
 *
 * The rest of the fingerprint is a single query against whatever `names` is
 * live at that instant, so it flips with the rename itself rather than with the
 * follow-up write:
 *   - `n` / `total` catch any change in the name set or the counts;
 *   - `id_weighted` catches a rebuild that reassigns ids while leaving the data
 *     identical, which is the case that would otherwise slip through — paging
 *     is by `names.id`, so reshuffled ids tear the scan even when nothing else
 *     moves.
 */
export async function readLiveFingerprint(): Promise<string> {
  const [version] = await d1Query<{ value: string }>("SELECT value FROM meta WHERE key = 'data_version'");
  if (!version?.value) {
    throw new D1IntegrityError("D1 meta.data_version is missing; refusing to read a database of unknown vintage");
  }
  const [shape] = await d1Query<{ n: number; total: number; id_weighted: number }>(
    "SELECT COUNT(*) AS n, COALESCE(SUM(total_count), 0) AS total, COALESCE(SUM(id * total_count), 0) AS id_weighted FROM names",
  );
  if (!shape || !Number.isFinite(Number(shape.n)) || !Number.isFinite(Number(shape.total)) || !Number.isFinite(Number(shape.id_weighted))) {
    throw new D1IntegrityError("could not fingerprint the live `names` table");
  }
  return `${version.value}|${Number(shape.n)}|${Number(shape.total)}|${Number(shape.id_weighted)}`;
}

/**
 * Loads every (name, sex) series from the live D1 database.
 *
 * The yearly series is fetched as one `year:count` group_concat per name so the
 * ~2.2M `name_years` rows arrive as ~118k rows instead. Paging is by `names.id`
 * range rather than LIMIT/OFFSET so each request reads only its own slice.
 */
export async function loadD1Source(): Promise<LoadedSource> {
  // The scan spans many requests over several minutes, and the annual ingest
  // finalizes by renaming names_staging -> names in one transaction, which
  // regenerates ids. A swap mid-scan would silently tear the read: early id
  // ranges from the old table, later ones from the new, dropping or
  // duplicating names in a way the year_totals check cannot catch. Bracket the
  // scan with a fingerprint that flips with the rename itself.
  const fingerprintBefore = await readLiveFingerprint();

  const [bounds] = await d1Query<{ min_id: number; max_id: number; min_year: number; max_year: number }>(
    "SELECT MIN(id) AS min_id, MAX(id) AS max_id, (SELECT MIN(year) FROM name_years) AS min_year, (SELECT MAX(year) FROM name_years) AS max_year FROM names",
  );
  if (!bounds || bounds.max_id == null) throw new D1IntegrityError("D1 `names` table is empty");

  const records: SourceNameRecord[] = [];
  for (let lo = bounds.min_id; lo <= bounds.max_id; lo += D1_ID_CHUNK) {
    const hi = lo + D1_ID_CHUNK - 1;
    const rows = await d1Query<{ id: number; name: string; sex: string; total_count: number; series: string | null }>(
      "SELECT n.id AS id, n.name AS name, n.sex AS sex, n.total_count AS total_count, group_concat(y.year || ':' || y.count) AS series " +
        "FROM names n JOIN name_years y ON y.name_id = n.id " +
        "WHERE n.id >= ?1 AND n.id <= ?2 GROUP BY n.id",
      [String(lo), String(hi)],
    );
    for (const row of rows) {
      if (row.sex !== "M" && row.sex !== "F") throw new D1IntegrityError(`D1 invalid sex ${row.sex} for ${row.name}`);
      const series: Record<number, number> = {};
      for (const pair of (row.series ?? "").split(",")) {
        if (!pair) continue;
        const colon = pair.indexOf(":");
        const year = Number(pair.slice(0, colon));
        const count = Number(pair.slice(colon + 1));
        if (!Number.isFinite(year) || !Number.isFinite(count) || count <= 0) continue;
        series[year] = count;
      }
      const sum = Object.values(series).reduce((total, count) => total + count, 0);
      if (sum < row.total_count) throw new D1IntegrityError(`D1 names.total_count exceeds granular rows for ${row.name}|${row.sex}: ${row.total_count} > ${sum}`);
      if (Object.keys(series).length) records.push({ name: row.name, sex: row.sex, series });
    }
    console.error(`  d1: ids ${lo}–${hi} → ${records.length} records so far`);
  }
  if (!records.length) throw new D1IntegrityError("no (name, sex) records loaded from D1");

  // Direct check on the tear's symptom, independent of any marker: paging by
  // id can only produce a duplicate (name, sex) if the id space shifted under
  // the scan.
  const seen = new Set<string>();
  for (const rec of records) {
    const key = `${rec.name}|${rec.sex}`;
    if (seen.has(key)) {
      throw new D1IntegrityError(`duplicate (name, sex) in the D1 scan: ${key}. The id space shifted mid-scan; re-run the build.`);
    }
    seen.add(key);
  }

  const fingerprintAfter = await readLiveFingerprint();
  if (fingerprintAfter !== fingerprintBefore) {
    throw new D1IntegrityError(
      `D1 changed mid-scan (${fingerprintBefore} -> ${fingerprintAfter}): an ingest finalized while paging, ` +
        "so this read may be torn across two vintages. Re-run the build.",
    );
  }

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
  const totalKeys = new Set(totals.map((total) => `${total.year}:${total.sex}`));
  for (const key of sums.keys()) if (!totalKeys.has(key)) throw new D1IntegrityError(`D1 missing year_totals row ${key}`);
  let driftPairs = 0;
  let driftBirths = 0;
  for (const t of totals) {
    const got = sums.get(`${t.year}:${t.sex}`) ?? 0;
    const diff = Math.abs(got - t.total);
    if (diff === 0) continue;
    const tolerance = Math.max(50, t.total * 1e-4);
    if (diff > tolerance) {
      throw new D1IntegrityError(`d1/year_totals mismatch ${t.year} ${t.sex}: series sum ${got} vs year_totals ${t.total} (diff ${diff} > tolerance ${Math.round(tolerance)})`);
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
    sourceType: "d1",
    fingerprint: `${fingerprintBefore}|content:${sourceFingerprint(fingerprintBefore.split("|")[0]!, records).split("|sha256:")[1]}`,
    validationOnly: false,
  };
}

export function sourceYearBounds(records: SourceNameRecord[]): { minYear: number; maxYear: number } {
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    for (const yearText of Object.keys(record.series)) {
      const year = Number(yearText);
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
    }
  }
  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) throw new D1IntegrityError("source has no valid year rows");
  return { minYear, maxYear };
}

/** Load the portable current-source SQLite snapshot in read-only mode. */
export async function loadSqliteSource(sqlitePath: string): Promise<LoadedSource> {
  if (!sqlitePath) throw new Error("--source=sqlite requires --sqlite=PATH");
  const sqliteModuleName = "node:sqlite";
  const sqlite = await import(sqliteModuleName) as { DatabaseSync: new (path: string, options: { readOnly: boolean }) => any };
  const { DatabaseSync } = sqlite;
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const required = ["names", "name_years", "meta", "year_totals"];
    for (const table of required) if (!tables.some((row) => row.name === table)) throw new D1IntegrityError(`SQLite source missing required table ${table}`);
    const metaRows = db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[];
    const meta = new Map(metaRows.map((row) => [row.key, row.value]));
    const dataVersion = meta.get("data_version");
    if (!dataVersion) throw new D1IntegrityError("SQLite meta.data_version is missing");
    const expectedMin = Number(meta.get("min_year"));
    const expectedMax = Number(meta.get("max_year"));
    if (!Number.isInteger(expectedMin) || !Number.isInteger(expectedMax)) throw new D1IntegrityError("SQLite meta.min_year/meta.max_year are missing or invalid");
    const [shape] = db.prepare("SELECT COUNT(*) AS names, (SELECT COUNT(DISTINCT name_id) FROM name_years) AS covered, (SELECT COUNT(*) FROM name_years y LEFT JOIN names n ON n.id = y.name_id WHERE n.id IS NULL) AS orphan_years FROM names").all() as { names: number; covered: number; orphan_years: number }[];
    if (!shape || shape.orphan_years > 0) throw new D1IntegrityError("SQLite name_years contains rows without a names row");
    if (shape.covered !== shape.names) throw new D1IntegrityError("SQLite names row exists without name_years");
    const rows = db.prepare(
      "SELECT n.id, n.name, n.name_lower, n.sex, n.total_count, y.year, y.count FROM names n JOIN name_years y ON y.name_id = n.id ORDER BY n.name_lower, n.sex, y.year",
    ).all() as { id: number; name: string; name_lower: string; sex: string; total_count: number; year: number; count: number }[];
    if (!rows.length) throw new D1IntegrityError("SQLite source has no name series rows");
    type SqliteRecord = SourceNameRecord & { id: number; totalCount: number };
    const records: SqliteRecord[] = [];
    const byId = new Map<number, SqliteRecord>();
    const seenKeys = new Set<string>();
    for (const row of rows) {
      if (row.sex !== "M" && row.sex !== "F") throw new D1IntegrityError(`SQLite invalid sex ${row.sex}`);
      if (!Number.isInteger(row.year) || row.year < 1800 || !Number.isInteger(row.count) || row.count <= 0) throw new D1IntegrityError(`SQLite invalid year/count for ${row.name}|${row.sex}`);
      let rec = byId.get(row.id);
      if (!rec) {
        const key = `${row.name}|${row.sex}`;
        if (seenKeys.has(key)) throw new D1IntegrityError(`duplicate (name, sex) in SQLite source: ${key}`);
        seenKeys.add(key);
        rec = { id: row.id, name: row.name, sex: row.sex, series: {}, totalCount: row.total_count };
        byId.set(row.id, rec);
        records.push(rec);
      }
      if (rec.series[row.year] !== undefined) throw new D1IntegrityError(`duplicate year row in SQLite source: ${row.name} ${row.year}`);
      rec.series[row.year] = row.count;
    }
    const { minYear, maxYear } = sourceYearBounds(records);
    if (Number.isFinite(expectedMin) && expectedMin !== minYear) throw new D1IntegrityError(`SQLite min_year ${expectedMin} != series ${minYear}`);
    if (Number.isFinite(expectedMax) && expectedMax !== maxYear) throw new D1IntegrityError(`SQLite max_year ${expectedMax} != series ${maxYear}`);
    let laggingNames = 0;
    let laggingBirths = 0;
    for (const rec of records) {
      const sum = Object.values(rec.series).reduce((total, count) => total + count, 0);
      if (sum < rec.totalCount) throw new D1IntegrityError(`SQLite names.total_count exceeds granular rows for ${rec.name}|${rec.sex}: ${rec.totalCount} > ${sum}`);
      if (sum > rec.totalCount) { laggingNames += 1; laggingBirths += sum - rec.totalCount; }
    }
    if (laggingNames) console.error(`  sqlite: names rollup lags granular rows for ${laggingNames} names, ${laggingBirths} births total; name_years used`);
    const totals = db.prepare("SELECT year, sex, total FROM year_totals ORDER BY year, sex").all() as { year: number; sex: string; total: number }[];
    const sums = new Map<string, number>();
    for (const rec of records) for (const [year, count] of Object.entries(rec.series)) sums.set(`${year}:${rec.sex}`, (sums.get(`${year}:${rec.sex}`) ?? 0) + count);
    const totalKeys = new Set(totals.map((total) => `${total.year}:${total.sex}`));
    for (let year = minYear; year <= maxYear; year++) {
      for (const sex of ["F", "M"]) if (!totalKeys.has(`${year}:${sex}`)) throw new D1IntegrityError(`SQLite missing year_totals row ${year}:${sex}`);
    }
    for (const total of totals) {
      const got = sums.get(`${total.year}:${total.sex}`) ?? 0;
      const diff = Math.abs(got - total.total);
      const tolerance = Math.max(50, total.total * 1e-4);
      if (diff > tolerance) throw new D1IntegrityError(`sqlite/year_totals mismatch ${total.year} ${total.sex}: ${got} vs ${total.total}`);
    }
    const ids = new Map(records.map((rec) => [`${rec.name}|${rec.sex}`, rec.id]));
    const sourceVersion = `ssa-national-${maxYear}`;
    sortRecords(records);
    return {
      source: { minYear, maxYear, records: records.map(({ id: _id, totalCount: _totalCount, ...record }) => record) }, sourceVersion,
      sourceLabel: `current SQLite ${sqlitePath} (${sourceVersion})`, sourceType: "sqlite",
      fingerprint: sourceFingerprint(dataVersion, records, ids),
      validationOnly: false,
    };
  } finally {
    db.close();
  }
}

function sortRecords(records: SourceNameRecord[]): void {
  records.sort((a, b) =>
    a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : a.sex < b.sex ? -1 : 1,
  );
}

// ---------------------------------------------------------------------------
// source resolution: --source shards|zip|auto (default auto)
// ---------------------------------------------------------------------------

export interface SourceResolutionOptions { source?: "d1" | "sqlite" | "zip" | "shards" | "auto"; sqlitePath?: string; zipPath?: string; }

export interface SourceLoaders {
  d1: () => Promise<LoadedSource>;
  zip: (path?: string) => Promise<LoadedSource>;
  shards: () => Promise<LoadedSource>;
  localZip: () => Promise<string | undefined>;
}

const DEFAULT_SOURCE_LOADERS: SourceLoaders = {
  d1: loadD1Source,
  zip: loadZipSource,
  shards: loadShardSource,
  localZip: findLocalZip,
};

export async function resolveSourceWithLoaders(options: SourceResolutionOptions = {}, loaders: SourceLoaders = DEFAULT_SOURCE_LOADERS): Promise<LoadedSource> {
  const sourceArg = options.source ?? (process.argv.find((a) => a.startsWith("--source="))?.slice("--source=".length) as SourceResolutionOptions["source"] ?? "auto");
  const zipArg = options.zipPath ?? process.argv.find((a) => a.startsWith("--zip="))?.slice("--zip=".length);
  if (sourceArg === "sqlite") return loadSqliteSource(options.sqlitePath ?? process.argv.find((a) => a.startsWith("--sqlite="))?.slice("--sqlite=".length) ?? "");
  if (zipArg) return loaders.zip(zipArg);
  if (sourceArg === "d1") return loaders.d1();
  if (sourceArg === "shards") return loaders.shards();
  if (sourceArg === "zip") return loaders.zip(await loaders.localZip());
  if (sourceArg !== "auto") throw new Error(`unknown --source=${sourceArg} (expected d1|sqlite|shards|zip|auto)`);
  try {
    return await loaders.d1();
  } catch (err) {
    if (err instanceof D1IntegrityError) throw err;
    console.error(`D1 unavailable (${(err as Error).message}); trying zip sources`);
  }
  const localZip = await loaders.localZip();
  if (localZip) return loaders.zip(localZip);
  try {
    return await loaders.zip();
  } catch (err) {
    console.error(`ssa.gov unreachable (${(err as Error).message}); falling back to tracked shards`);
    return loaders.shards();
  }
}

export async function resolveSource(options: SourceResolutionOptions = {}): Promise<LoadedSource> {
  return resolveSourceWithLoaders(options);
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
