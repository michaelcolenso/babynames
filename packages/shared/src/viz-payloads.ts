// Pre-computed payloads for the whole-dataset visualisation endpoints
// (`viz_payloads`, migration 0023).
//
// Each of these endpoints aggregates every row of name_years to emit a few
// hundred KB of JSON. Measured on production, one uncached request read 4.4M to
// 15.3M rows and took 8–34 seconds. The inputs change once a year, so the work
// is done at ingest and the endpoint reads one row.
//
// Three pieces per endpoint, kept separate on purpose:
//   collect*  — pulls the aggregate from D1, one year per statement so peak
//               memory stays flat (see the Error 1101 note in d1-queries.ts).
//   build*    — pure shaping. No D1, so it is directly testable and is the
//               single definition of each response body.
//   getVizPayload — read the stored payload, or collect+build on the spot.
//
// The endpoints and the ingest writer both go through build*, so a stored
// payload and a live-computed one cannot drift.

import type { D1Database } from "@cloudflare/workers-types";
import type { Sex } from "./schema";

export const VIZ_KEYS = ["concentration", "terminal-letters", "suffix-waves", "name-survival"] as const;
export type VizKey = (typeof VIZ_KEYS)[number];

// How many per-year statements to pipeline in one db.batch(). Matches the
// batching used by the rank readers.
const YEAR_BATCH = 12;

async function dataYears(db: D1Database): Promise<number[]> {
  const r = await db.prepare(`SELECT DISTINCT year FROM year_totals ORDER BY year`).all<{ year: number }>();
  return (r.results ?? []).map((row) => row.year);
}

// Runs `make(year)` for every year, YEAR_BATCH statements at a time, and hands
// each year's rows to `onRows`. Keeps every statement scoped to a single year.
async function perYear<T>(
  db: D1Database,
  years: number[],
  make: (year: number) => ReturnType<D1Database["prepare"]>,
  onRows: (year: number, rows: T[]) => void,
): Promise<void> {
  for (let i = 0; i < years.length; i += YEAR_BATCH) {
    const slice = years.slice(i, i + YEAR_BATCH);
    const results = await db.batch<T>(slice.map((year) => make(year)));
    results.forEach((res, idx) => onRows(slice[idx]!, res.results ?? []));
  }
}

/* ------------------------------------------------------------------ *
 * /api/concentration
 * ------------------------------------------------------------------ */

export interface ConcentrationYear {
  year: number;
  sex: Sex;
  hhi: number;
  top1Share: number;
  top10Share: number;
  uniqueNames: number;
  total: number;
}

export interface ConcentrationResponse {
  ym: number;
  yM: number;
  data: ConcentrationYear[];
}

interface ConcentrationRow {
  year: number;
  sex: Sex;
  hhi: number;
  top1_share: number;
  top10_share: number;
  unique_names: number;
  total: number;
}

export async function collectConcentration(db: D1Database): Promise<ConcentrationRow[]> {
  const years = await dataYears(db);
  const out: ConcentrationRow[] = [];
  await perYear<Omit<ConcentrationRow, "year">>(
    db,
    years,
    (year) =>
      db
        .prepare(
          `WITH ranked AS (
             SELECT n.sex, ny.count,
                    ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY ny.count DESC) AS rn
               FROM name_years ny
               JOIN names n ON n.id = ny.name_id
              WHERE ny.year = ?1
           )
           SELECT r.sex,
                  SUM(CAST(r.count AS REAL) * r.count) / (yt.total * yt.total) AS hhi,
                  SUM(CASE WHEN r.rn = 1 THEN r.count ELSE 0 END) * 1.0 / yt.total AS top1_share,
                  SUM(CASE WHEN r.rn <= 10 THEN r.count ELSE 0 END) * 1.0 / yt.total AS top10_share,
                  COUNT(*) AS unique_names,
                  yt.total AS total
             FROM ranked r
             JOIN year_totals yt ON yt.year = ?1 AND yt.sex = r.sex
            GROUP BY r.sex, yt.total
            ORDER BY r.sex`,
        )
        .bind(year),
    (year, rows) => {
      for (const r of rows) out.push({ year, ...r });
    },
  );
  return out;
}

export function buildConcentration(rows: ConcentrationRow[], ym: number, yM: number): ConcentrationResponse {
  return {
    ym,
    yM,
    data: rows.map((r) => ({
      year: r.year,
      sex: r.sex,
      hhi: r.hhi,
      top1Share: r.top1_share,
      top10Share: r.top10_share,
      uniqueNames: r.unique_names,
      total: r.total,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * /api/terminal-letters
 * ------------------------------------------------------------------ */

export interface TerminalLettersResponse {
  ym: number;
  yM: number;
  years: number[];
  letters: string[];
  F: number[][];
  M: number[][];
  Fraw: number[][];
  Mraw: number[][];
}

interface LetterRow {
  year: number;
  sex: Sex;
  letter: string;
  count: number;
}

export async function collectTerminalLetters(db: D1Database): Promise<LetterRow[]> {
  const years = await dataYears(db);
  const out: LetterRow[] = [];
  await perYear<Omit<LetterRow, "year">>(
    db,
    years,
    (year) =>
      db
        .prepare(
          `SELECT n.sex, UPPER(SUBSTR(n.name, -1)) AS letter, SUM(ny.count) AS count
             FROM name_years ny
             JOIN names n ON n.id = ny.name_id
            WHERE ny.year = ?1
            GROUP BY n.sex, letter
            ORDER BY n.sex, letter`,
        )
        .bind(year),
    (year, rows) => {
      for (const r of rows) out.push({ year, ...r });
    },
  );
  return out;
}

export function buildTerminalLetters(rows: LetterRow[], ym: number, yM: number): TerminalLettersResponse {
  const yearSet = new Set<number>();
  const letterSet = new Set<string>();
  for (const r of rows) {
    yearSet.add(r.year);
    if (/^[A-Z]$/.test(r.letter)) letterSet.add(r.letter);
  }
  const years = [...yearSet].sort((a, b) => a - b);
  const letters = [...letterSet].sort();

  const yearIdx = new Map(years.map((y, i) => [y, i]));
  const letterIdx = new Map(letters.map((l, i) => [l, i]));
  const grid = () => Array.from({ length: years.length }, () => new Array<number>(letters.length).fill(0));
  const Fraw = grid();
  const Mraw = grid();

  for (const r of rows) {
    if (!/^[A-Z]$/.test(r.letter)) continue;
    const yi = yearIdx.get(r.year)!;
    const li = letterIdx.get(r.letter)!;
    const target = r.sex === "F" ? Fraw[yi] : Mraw[yi];
    if (target) target[li] = r.count;
  }

  // Shares within each year, rounded to 4 decimals (matches the pre-existing
  // response contract the client charts against).
  const share = (raw: number[][]) =>
    raw.map((row) => {
      const total = row.reduce((s, v) => s + v, 0);
      return total === 0 ? row : row.map((v) => Math.round((v / total) * 10000) / 10000);
    });

  return { ym, yM, years, letters, F: share(Fraw), M: share(Mraw), Fraw, Mraw };
}

/* ------------------------------------------------------------------ *
 * /api/suffix-waves
 * ------------------------------------------------------------------ */

export const SUFFIX_TOP_N = 20;

export interface SuffixWavesResponse {
  ym: number;
  yM: number;
  suffixes: string[];
  years: number[];
  F: number[][];
  M: number[][];
}

interface SuffixRow {
  year: number;
  sex: Sex;
  suffix: string;
  count: number;
}

export interface SuffixData {
  years: number[];
  topSuffixes: string[];
  rows: SuffixRow[];
}

// Two passes, both per-year. The first ranks suffixes by all-time births while
// returning only ~1k rows per year; the second pulls the per-sex series for the
// top N only. Collecting every (suffix, year, sex) row instead would mean
// holding ~317k rows in Worker memory to use 6k of them.
export async function collectSuffixWaves(db: D1Database, topN = SUFFIX_TOP_N): Promise<SuffixData> {
  const years = await dataYears(db);

  const totals = new Map<string, number>();
  await perYear<{ suffix: string; count: number }>(
    db,
    years,
    (year) =>
      db
        .prepare(
          `SELECT UPPER(SUBSTR(n.name, -3)) AS suffix, SUM(ny.count) AS count
             FROM name_years ny
             JOIN names n ON n.id = ny.name_id
            WHERE ny.year = ?1
            GROUP BY suffix`,
        )
        .bind(year),
    (_year, rows) => {
      for (const r of rows) totals.set(r.suffix, (totals.get(r.suffix) ?? 0) + r.count);
    },
  );

  const topSuffixes = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([s]) => s);
  if (!topSuffixes.length) return { years, topSuffixes, rows: [] };

  const placeholders = topSuffixes.map((_, i) => `?${i + 2}`).join(", ");
  const rows: SuffixRow[] = [];
  await perYear<Omit<SuffixRow, "year">>(
    db,
    years,
    (year) =>
      db
        .prepare(
          `SELECT UPPER(SUBSTR(n.name, -3)) AS suffix, n.sex, SUM(ny.count) AS count
             FROM name_years ny
             JOIN names n ON n.id = ny.name_id
            WHERE ny.year = ?1
              AND UPPER(SUBSTR(n.name, -3)) IN (${placeholders})
            GROUP BY suffix, n.sex`,
        )
        .bind(year, ...topSuffixes),
    (year, res) => {
      for (const r of res) rows.push({ year, ...r });
    },
  );

  return { years, topSuffixes, rows };
}

export function buildSuffixWaves(data: SuffixData, ym: number, yM: number): SuffixWavesResponse {
  const years = [...data.years].sort((a, b) => a - b);
  const yearIdx = new Map(years.map((y, i) => [y, i]));
  const suffixIdx = new Map(data.topSuffixes.map((s, i) => [s, i]));
  const width = data.topSuffixes.length;

  const grid = () => years.map(() => new Array<number>(width).fill(0));
  const F = grid();
  const M = grid();

  for (const r of data.rows) {
    const yi = yearIdx.get(r.year);
    const si = suffixIdx.get(r.suffix);
    if (yi === undefined || si === undefined) continue;
    const target = r.sex === "F" ? F[yi] : M[yi];
    if (target) target[si] = r.count;
  }

  return { ym, yM, suffixes: data.topSuffixes, years, F, M };
}

/* ------------------------------------------------------------------ *
 * /api/name-survival
 * ------------------------------------------------------------------ */

export interface SurvivalPoint {
  decade: number;
  sex: Sex;
  offset: number;
  rate: number;
  alive: number;
  cohortSize: number;
}

export interface NameSurvivalResponse {
  ym: number;
  yM: number;
  data: SurvivalPoint[];
}

export interface SurvivalData {
  sizes: { cohort: number; sex: Sex; total: number }[];
  alive: { cohort: number; sex: Sex; year: number; alive: number }[];
}

// Cohorts are keyed on names.first_year, so cohort membership is fixed and only
// the per-year "still appearing" count needs the year-by-year walk.
export async function collectNameSurvival(db: D1Database, yM: number): Promise<SurvivalData> {
  const cutoff = yM - 5; // matches the endpoint's existing cohort cutoff
  const sizesRes = await db
    .prepare(
      `SELECT (first_year / 10 * 10) AS cohort, sex, COUNT(*) AS total
         FROM names
        WHERE first_year >= 1880 AND first_year <= ?1
        GROUP BY cohort, sex`,
    )
    .bind(cutoff)
    .all<{ cohort: number; sex: Sex; total: number }>();

  const years = await dataYears(db);
  const alive: SurvivalData["alive"] = [];
  await perYear<{ cohort: number; sex: Sex; alive: number }>(
    db,
    years,
    (year) =>
      db
        .prepare(
          `SELECT (n.first_year / 10 * 10) AS cohort, n.sex, COUNT(*) AS alive
             FROM name_years ny
             JOIN names n ON n.id = ny.name_id
            WHERE ny.year = ?1
              AND n.first_year >= 1880 AND n.first_year <= ?2
            GROUP BY cohort, n.sex`,
        )
        .bind(year, cutoff),
    (year, rows) => {
      for (const r of rows) alive.push({ cohort: r.cohort, sex: r.sex, year, alive: r.alive });
    },
  );

  return { sizes: sizesRes.results ?? [], alive };
}

export function buildNameSurvival(data: SurvivalData, ym: number, yM: number): NameSurvivalResponse {
  const sizeOf = new Map(data.sizes.map((s) => [`${s.cohort}\x00${s.sex}`, s.total]));

  const points: SurvivalPoint[] = [];
  for (const a of data.alive) {
    const total = sizeOf.get(`${a.cohort}\x00${a.sex}`);
    if (!total) continue;
    const offset = a.year - a.cohort;
    if (offset < 0 || offset > 140) continue;
    points.push({
      decade: a.cohort,
      sex: a.sex,
      offset,
      rate: Math.round((a.alive / total) * 10000) / 10000,
      alive: a.alive,
      cohortSize: total,
    });
  }

  points.sort((x, y) => x.decade - y.decade || x.sex.localeCompare(y.sex) || x.offset - y.offset);
  return { ym, yM, data: points };
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

// Computes one endpoint's response body straight from D1.
export async function computeVizPayload(db: D1Database, key: VizKey, ym: number, yM: number): Promise<unknown> {
  switch (key) {
    case "concentration":
      return buildConcentration(await collectConcentration(db), ym, yM);
    case "terminal-letters":
      return buildTerminalLetters(await collectTerminalLetters(db), ym, yM);
    case "suffix-waves":
      return buildSuffixWaves(await collectSuffixWaves(db), ym, yM);
    case "name-survival":
      return buildNameSurvival(await collectNameSurvival(db, yM), ym, yM);
  }
}

// Returns the stored payload only if it was built from the dataset currently
// being served. A mismatch (or a missing table, pre-migration) reads as absent.
export async function readVizPayload<T>(
  db: D1Database,
  key: VizKey,
  dataVersion: string,
): Promise<T | null> {
  if (!dataVersion) return null;
  try {
    const row = await db
      .prepare(`SELECT payload FROM viz_payloads WHERE key = ?1 AND source_version = ?2`)
      .bind(key, dataVersion)
      .first<{ payload: string }>();
    if (!row?.payload) return null;
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export async function writeVizPayload(
  db: D1Database,
  key: VizKey,
  payload: unknown,
  dataVersion: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO viz_payloads(key, payload, source_version, generated_at)
       VALUES(?1, ?2, ?3, ?4)
       ON CONFLICT(key) DO UPDATE SET
         payload = excluded.payload,
         source_version = excluded.source_version,
         generated_at = excluded.generated_at`,
    )
    .bind(key, JSON.stringify(payload), dataVersion, new Date().toISOString())
    .run();
}

// What the endpoints call: stored payload if it is current, otherwise compute
// live. The fallback is slow (this is the query the table exists to avoid) but
// keeps every endpoint correct before the first publish and if a build fails.
export async function getVizPayload<T>(
  db: D1Database,
  key: VizKey,
  dataVersion: string,
  ym: number,
  yM: number,
): Promise<T> {
  const stored = await readVizPayload<T>(db, key, dataVersion);
  if (stored) return stored;
  return (await computeVizPayload(db, key, ym, yM)) as T;
}

// Builds and stores every payload. Each key is one row write, so a key becomes
// visible atomically and a failure part-way leaves the remaining endpoints on
// the live path rather than serving something half-built.
export async function publishVizPayloads(
  db: D1Database,
  ym: number,
  yM: number,
  dataVersion: string,
): Promise<VizKey[]> {
  if (!dataVersion) throw new Error("publishVizPayloads requires a non-empty dataVersion");
  const done: VizKey[] = [];
  for (const key of VIZ_KEYS) {
    const payload = await computeVizPayload(db, key, ym, yM);
    await writeVizPayload(db, key, payload, dataVersion);
    done.push(key);
  }
  return done;
}

// Carries payloads across a data_version bump that did not touch name_years —
// the diaspora recompute bumps it purely to bust edge caches. Without this they
// would all fall back to the live query until the next SSA ingest.
export async function revalidateVizPayloads(
  db: D1Database,
  oldDataVersion: string,
  newDataVersion: string,
): Promise<void> {
  if (!oldDataVersion || !newDataVersion) return;
  try {
    await db
      .prepare(`UPDATE viz_payloads SET source_version = ?2 WHERE source_version = ?1`)
      .bind(oldDataVersion, newDataVersion)
      .run();
  } catch {
    // Table not present yet; nothing to carry.
  }
}
