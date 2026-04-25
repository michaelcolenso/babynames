// Typed D1 query helpers shared between Pages Functions and the ingest
// worker. Each function returns plain rows; the caller is responsible for
// any further shaping (cache wrapping, JSON serialization).

import type { D1Database } from "@cloudflare/workers-types";
import type { LandingKind, NameRow, SearchHit, Sex } from "./schema";

export async function getMeta(db: D1Database, key: string): Promise<string | null> {
  const r = await db
    .prepare("SELECT value FROM meta WHERE key = ?1")
    .bind(key)
    .first<{ value: string }>();
  return r?.value ?? null;
}

export async function setMeta(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO meta(key, value) VALUES(?1, ?2) " +
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(key, value)
    .run();
}

// Prefix autocomplete via half-open range scan on the (name_lower, peak_count DESC) index.
// We bracket [prefix, prefix + "￿") for stable Unicode ordering.
export async function searchByPrefix(
  db: D1Database,
  prefix: string,
  limit = 10,
): Promise<SearchHit[]> {
  const lo = prefix.toLowerCase();
  const hi = lo + "￿";
  const r = await db
    .prepare(
      `SELECT name, sex, peak_year, peak_count
         FROM names
        WHERE name_lower >= ?1 AND name_lower < ?2
        ORDER BY peak_count DESC
        LIMIT ?3`,
    )
    .bind(lo, hi, limit)
    .all<SearchHit>();
  return r.results ?? [];
}

export interface NameWithSeries {
  row: NameRow;
  series: { year: number; count: number }[];
}

export async function getNameWithSeries(
  db: D1Database,
  nameLower: string,
): Promise<NameWithSeries[]> {
  // Pull both sexes in one round-trip using a join. SQLite returns the
  // wide row repeated; we group on the client side. The (name_id, year)
  // PK keeps the series ordered.
  const r = await db
    .prepare(
      `SELECT n.id, n.name, n.name_lower, n.sex, n.first_year, n.last_year,
              n.peak_year, n.peak_count, n.total_count, n.status, n.decline_pct,
              n.latest_count, n.prev_decade, n.curr_decade, n.growth_x,
              ny.year, ny.count
         FROM names n
         JOIN name_years ny ON ny.name_id = n.id
        WHERE n.name_lower = ?1
        ORDER BY n.sex, ny.year`,
    )
    .bind(nameLower)
    .all<NameRow & { year: number; count: number }>();

  const grouped = new Map<number, NameWithSeries>();
  for (const row of r.results ?? []) {
    let g = grouped.get(row.id);
    if (!g) {
      g = {
        row: {
          id: row.id,
          name: row.name,
          name_lower: row.name_lower,
          sex: row.sex,
          first_year: row.first_year,
          last_year: row.last_year,
          peak_year: row.peak_year,
          peak_count: row.peak_count,
          total_count: row.total_count,
          status: row.status,
          decline_pct: row.decline_pct,
          latest_count: row.latest_count,
          prev_decade: row.prev_decade,
          curr_decade: row.curr_decade,
          growth_x: row.growth_x,
        },
        series: [],
      };
      grouped.set(row.id, g);
    }
    g.series.push({ year: row.year, count: row.count });
  }
  return [...grouped.values()];
}

export async function listLanding(
  db: D1Database,
  kind: LandingKind,
  limit = 500,
): Promise<NameRow[]> {
  const orderBy = kind === "rising" ? "curr_decade DESC" : "peak_count DESC";
  const r = await db
    .prepare(
      `SELECT id, name, name_lower, sex, first_year, last_year,
              peak_year, peak_count, total_count, status, decline_pct,
              latest_count, prev_decade, curr_decade, growth_x
         FROM names
        WHERE status = ?1
        ORDER BY ${orderBy}
        LIMIT ?2`,
    )
    .bind(kind, limit)
    .all<NameRow>();
  return r.results ?? [];
}

export async function listLandingWithSparks(
  db: D1Database,
  kind: LandingKind,
  limit = 500,
): Promise<(NameRow & { spark_blob: ArrayBuffer | null })[]> {
  const orderBy = kind === "rising" ? "curr_decade DESC" : "peak_count DESC";
  const r = await db
    .prepare(
      `SELECT id, name, name_lower, sex, first_year, last_year,
              peak_year, peak_count, total_count, status, decline_pct,
              latest_count, prev_decade, curr_decade, growth_x, spark_blob
         FROM names
        WHERE status = ?1
        ORDER BY ${orderBy}
        LIMIT ?2`,
    )
    .bind(kind, limit)
    .all<NameRow & { spark_blob: ArrayBuffer | null }>();
  return r.results ?? [];
}

export interface YearTotal {
  year: number;
  sex: Sex;
  total: number;
}

export async function listYearTotals(db: D1Database): Promise<YearTotal[]> {
  const r = await db
    .prepare(`SELECT year, sex, total FROM year_totals ORDER BY year`)
    .all<YearTotal>();
  return r.results ?? [];
}

export interface TopByYear {
  year: number;
  sex: Sex;
  name: string;
  count: number;
}

// Returns the top-N per (year, sex). Used by /api/meta to populate the
// "popular right now" grid on the home page. We compute it lazily and
// cache the response — the underlying query is cheap with the
// (year, count DESC) covering index but still a hot path.
export async function topByYear(
  db: D1Database,
  perBucket = 10,
): Promise<TopByYear[]> {
  const r = await db
    .prepare(
      `WITH ranked AS (
         SELECT n.name, n.sex, ny.year, ny.count,
                ROW_NUMBER() OVER (PARTITION BY ny.year, n.sex ORDER BY ny.count DESC) AS rn
           FROM name_years ny
           JOIN names n ON n.id = ny.name_id
       )
       SELECT year, sex, name, count
         FROM ranked
        WHERE rn <= ?1
        ORDER BY year, sex, count DESC`,
    )
    .bind(perBucket)
    .all<TopByYear>();
  return r.results ?? [];
}

export interface YearTopRow {
  name: string;
  sex: Sex;
  count: number;
  rank: number;
}

// Top-N names for a specific birth year. Used by /api/year/:year.
export async function topBySpecificYear(
  db: D1Database,
  year: number,
  limit = 50,
): Promise<YearTopRow[]> {
  const r = await db
    .prepare(
      `SELECT n.name, n.sex, ny.count,
              ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY ny.count DESC) AS rank
         FROM name_years ny
         JOIN names n ON n.id = ny.name_id
        WHERE ny.year = ?1
        ORDER BY n.sex, ny.count DESC
        LIMIT ?2`,
    )
    .bind(year, limit)
    .all<YearTopRow>();
  return r.results ?? [];
}

// Comeback names: peaked pre-1975 at 5k+ births, currently growing/stable with
// meaningful counts. Proxy for "had a valley and came back."
export async function listComeback(
  db: D1Database,
  limit = 200,
): Promise<(NameRow & { spark_blob: ArrayBuffer | null })[]> {
  const r = await db
    .prepare(
      `SELECT id, name, name_lower, sex, first_year, last_year,
              peak_year, peak_count, total_count, status, decline_pct,
              latest_count, prev_decade, curr_decade, growth_x, spark_blob
         FROM names
        WHERE peak_count >= 5000
          AND peak_year <= 1975
          AND curr_decade >= 500
          AND status IN ('rising', 'stable')
        ORDER BY growth_x DESC, curr_decade DESC
        LIMIT ?1`,
    )
    .bind(limit)
    .all<NameRow & { spark_blob: ArrayBuffer | null }>();
  return r.results ?? [];
}

export interface SparkBlobRow {
  name: string;
  sex: Sex;
  spark_blob: ArrayBuffer | null;
}

// Returns name + sex + spark for every name that has a blob and meaningful
// history. Used by the /api/twin endpoint to find trajectory matches.
export async function listNameSparks(
  db: D1Database,
): Promise<SparkBlobRow[]> {
  const r = await db
    .prepare(
      `SELECT name, sex, spark_blob
         FROM names
        WHERE spark_blob IS NOT NULL
          AND peak_count >= 200`,
    )
    .all<SparkBlobRow>();
  return r.results ?? [];
}

// Fetches the spark_blob for a single name+sex. Used by /api/og.
export async function getNameSpark(
  db: D1Database,
  nameLower: string,
): Promise<(NameRow & { spark_blob: ArrayBuffer | null }) | null> {
  const r = await db
    .prepare(
      `SELECT id, name, name_lower, sex, first_year, last_year,
              peak_year, peak_count, total_count, status, decline_pct,
              latest_count, prev_decade, curr_decade, growth_x, spark_blob
         FROM names
        WHERE name_lower = ?1
        ORDER BY total_count DESC
        LIMIT 1`,
    )
    .bind(nameLower)
    .first<NameRow & { spark_blob: ArrayBuffer | null }>();
  return r ?? null;
}
