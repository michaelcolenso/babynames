// Typed D1 query helpers shared between Pages Functions and the ingest
// worker. Each function returns plain rows; the caller is responsible for
// any further shaping (cache wrapping, JSON serialization).

import type { D1Database } from "@cloudflare/workers-types";
import { RANKINGS_PER_SEX_LIMIT, rankingsReady } from "./rankings";
import type {
  BlogPost,
  BlogPostSummary,
  IndexableName,
  LandingKind,
  NameCatalyst,
  NameDiscoveryCard,
  NameDiscoveryCluster,
  NameDiscoveryClusterKind,
  NameDiscoveryModule,
  DiasporaResponse,
  DiasporaSpreadPoint,
  NameDiasporaRow,
  NameEnrichmentBundle,
  NameEnrichmentProfile,
  NameHistoricalProfile,
  NameRegionalAnomaly,
  MomentumDirection,
  MomentumRow,
  MomentumSort,
  NameRow,
  RelatedName,
  SearchHit,
  Sex,
  Status,
} from "./schema";
import { chunkedIn } from "./d1-chunk";
import { decodeSpark } from "./spark-blob";

export async function getMeta(db: D1Database, key: string): Promise<string | null> {
  const r = await db.prepare("SELECT value FROM meta WHERE key = ?1").bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function setMeta(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO meta(key, value) VALUES(?1, ?2) " + "ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(key, value)
    .run();
}

// Prefix autocomplete via half-open range scan on the (name_lower, peak_count DESC) index.
// We bracket [prefix, prefix + "￿") for stable Unicode ordering.
export async function searchByPrefix(db: D1Database, prefix: string, limit = 10): Promise<SearchHit[]> {
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

// Sitemap cohort: one canonical URL per spelling, using the dominant sex row.
// The threshold keeps very sparse SSA records out of initial indexation while
// preserving broad coverage for names with meaningful history.
export async function listIndexableNames(db: D1Database, limit = 49_900, offset = 0): Promise<IndexableName[]> {
  const cappedLimit = Math.max(1, Math.min(49_900, Math.floor(limit)));
  const safeOffset = Math.max(0, Math.floor(offset));
  const r = await db
    .prepare(
      `WITH canonical AS (
         SELECT name, name_lower, total_count, peak_count, latest_count, status, curr_decade, growth_x,
                ROW_NUMBER() OVER (
                  PARTITION BY name_lower
                  ORDER BY total_count DESC, peak_count DESC
                ) AS rn
           FROM names
       ),
       scored AS (
         SELECT name, name_lower, total_count, peak_count, latest_count, status, curr_decade, growth_x,
                (
                  CASE WHEN total_count >= 1000 THEN 2 ELSE 0 END +
                  CASE WHEN peak_count >= 100 THEN 2 WHEN peak_count >= 50 THEN 1 ELSE 0 END +
                  CASE WHEN latest_count >= 50 THEN 2 WHEN latest_count >= 20 THEN 1 ELSE 0 END +
                  CASE
                    WHEN COALESCE(curr_decade, 0) >= 250 THEN 2
                    WHEN COALESCE(curr_decade, 0) >= 100 THEN 1
                    ELSE 0
                  END +
                  CASE
                    WHEN COALESCE(growth_x, 0) >= 3 THEN 2
                    WHEN COALESCE(growth_x, 0) >= 1.5 THEN 1
                    ELSE 0
                  END +
                  CASE
                    WHEN status IN ('stable', 'rising') THEN 1
                    WHEN status = 'endangered' AND peak_count >= 500 THEN 1
                    WHEN status = 'extinct' AND total_count >= 5000 THEN 1
                    ELSE 0
                  END
                ) AS quality_score
           FROM canonical
          WHERE rn = 1
       )
       SELECT name, name_lower, total_count, peak_count, status
         FROM scored
        WHERE quality_score >= 3
          AND (
            total_count >= 300
            OR peak_count >= 40
            OR latest_count >= 10
            OR COALESCE(curr_decade, 0) >= 50
          )
        ORDER BY quality_score DESC, total_count DESC, peak_count DESC, latest_count DESC, name
        LIMIT ?1 OFFSET ?2`,
    )
    .bind(cappedLimit, safeOffset)
    .all<IndexableName>();
  return r.results ?? [];
}

export interface NameWithSeries {
  row: NameRow;
  series: { year: number; count: number }[];
}

export async function getNameWithSeries(db: D1Database, nameLower: string): Promise<NameWithSeries[]> {
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

export interface ShadowMatch {
  inputName: string;
  inputNameLower: string;
  inputSex: Sex;
  inputCount: number;
  shadowName: string;
  shadowNameLower: string;
  shadowCount: number;
  shadowSex: Sex;
  diff: number;
  birthYear: number;
  shadowYear: number;
}

/**
 * Look up the "shadow name" — the name in `shadowYear` whose birth count is
 * closest to `nameLower`'s count in `birthYear`, restricted to the same sex.
 * Precomputed offline by scripts/build-shadow-matches.ts into
 * name_shadow_matches (one row per name_lower+sex, for whichever birthYear
 * that table was last built for — see the migration for why this isn't
 * computed live). Returns null if there's no precomputed row for this exact
 * (nameLower, birthYear) — either the name has no data for that year, or
 * this year wasn't the one the table was built for.
 *
 * `sex` should be passed whenever the caller already knows which sex's page
 * it's linking from (e.g. the /name/:name/ dossier), so a unisex name
 * resolves to the same sex the visitor was just looking at rather than
 * whichever row happens to sort first.
 */
export async function getShadowName(
  db: D1Database,
  nameLower: string,
  birthYear: number,
  shadowYear: number,
  sex?: Sex,
): Promise<ShadowMatch | null> {
  const row = await db
    .prepare(
      sex
        ? `SELECT name AS input_name, name_lower AS input_lower, sex AS input_sex, input_count,
                  shadow_name, shadow_name_lower, shadow_sex, shadow_count, diff
             FROM name_shadow_matches
            WHERE name_lower = ?1 AND year = ?2 AND sex = ?3
            LIMIT 1`
        : `SELECT name AS input_name, name_lower AS input_lower, sex AS input_sex, input_count,
                  shadow_name, shadow_name_lower, shadow_sex, shadow_count, diff
             FROM name_shadow_matches
            WHERE name_lower = ?1 AND year = ?2
            ORDER BY sex
            LIMIT 1`,
    )
    .bind(...(sex ? [nameLower, birthYear, sex] : [nameLower, birthYear]))
    .first<{
      input_name: string;
      input_lower: string;
      input_sex: Sex;
      input_count: number;
      shadow_name: string;
      shadow_name_lower: string;
      shadow_sex: Sex;
      shadow_count: number;
      diff: number;
    }>();

  if (!row) return null;

  return {
    inputName: row.input_name,
    inputNameLower: row.input_lower,
    inputSex: row.input_sex,
    inputCount: row.input_count,
    shadowName: row.shadow_name,
    shadowNameLower: row.shadow_name_lower,
    shadowCount: row.shadow_count,
    shadowSex: row.shadow_sex,
    diff: row.diff,
    birthYear,
    shadowYear,
  };
}

export async function listRelatedNames(
  db: D1Database,
  currentNameLower: string,
  sex: Sex,
  status: Status,
  peakYear: number,
  limit = 6,
): Promise<RelatedName[]> {
  const cappedLimit = Math.max(1, Math.min(12, Math.floor(limit)));
  const r = await db
    .prepare(
      `SELECT name, sex, status, peak_year, peak_count, total_count
         FROM names
        WHERE name_lower <> ?1
          AND sex = ?2
          AND status = ?3
          AND (total_count >= 1000 OR peak_count >= 100)
        ORDER BY ABS(peak_year - ?4), total_count DESC
        LIMIT ?5`,
    )
    .bind(currentNameLower, sex, status, peakYear, cappedLimit)
    .all<RelatedName>();
  return r.results ?? [];
}

export async function listStatusNeighbors(
  db: D1Database,
  currentNameLower: string,
  sex: Sex,
  status: Status,
  totalCount: number,
  limit = 4,
): Promise<NameDiscoveryCard[]> {
  const cappedLimit = Math.max(1, Math.min(8, Math.floor(limit)));
  const r = await db
    .prepare(
      `SELECT name, sex, status, peak_year, peak_count, total_count, latest_count
         FROM names
        WHERE name_lower <> ?1
          AND sex = ?2
          AND status = ?3
          AND (
            total_count >= 750
            OR peak_count >= 75
            OR latest_count >= 25
            OR COALESCE(curr_decade, 0) >= 100
          )
        ORDER BY ABS(total_count - ?4), peak_count DESC, latest_count DESC, name
        LIMIT ?5`,
    )
    .bind(currentNameLower, sex, status, totalCount, cappedLimit)
    .all<NameDiscoveryCard>();
  return r.results ?? [];
}

export async function listPeakEraNeighbors(
  db: D1Database,
  currentNameLower: string,
  sex: Sex,
  peakYear: number,
  limit = 4,
): Promise<NameDiscoveryCard[]> {
  const cappedLimit = Math.max(1, Math.min(8, Math.floor(limit)));
  const r = await db
    .prepare(
      `SELECT name, sex, status, peak_year, peak_count, total_count, latest_count
         FROM names
        WHERE name_lower <> ?1
          AND sex = ?2
          AND peak_year BETWEEN ?3 AND ?4
          AND (
            total_count >= 750
            OR peak_count >= 75
            OR latest_count >= 25
          )
        ORDER BY ABS(peak_year - ?5), peak_count DESC, total_count DESC, name
        LIMIT ?6`,
    )
    .bind(currentNameLower, sex, peakYear - 8, peakYear + 8, peakYear, cappedLimit)
    .all<NameDiscoveryCard>();
  return r.results ?? [];
}

export async function listCurrentAlternatives(
  db: D1Database,
  currentNameLower: string,
  sex: Sex,
  limit = 4,
): Promise<NameDiscoveryCard[]> {
  const cappedLimit = Math.max(1, Math.min(8, Math.floor(limit)));
  const r = await db
    .prepare(
      `SELECT name, sex, status, peak_year, peak_count, total_count, latest_count
         FROM names
        WHERE name_lower <> ?1
          AND sex = ?2
          AND latest_count > 0
          AND (
            latest_count >= 100
            OR COALESCE(curr_decade, 0) >= 250
            OR (status = 'rising' AND COALESCE(growth_x, 0) >= 2)
          )
        ORDER BY latest_count DESC, COALESCE(curr_decade, 0) DESC, peak_count DESC, name
        LIMIT ?3`,
    )
    .bind(currentNameLower, sex, cappedLimit)
    .all<NameDiscoveryCard>();
  return r.results ?? [];
}

export async function getNameDiscoveryClusters(
  db: D1Database,
  args: {
    currentNameLower: string;
    sex: Sex;
    status: Status;
    peakYear: number;
    totalCount: number;
  },
): Promise<NameDiscoveryModule> {
  const [sameStatus, sameEra, currentAlternatives] = await Promise.all([
    listStatusNeighbors(db, args.currentNameLower, args.sex, args.status, args.totalCount, 4),
    listPeakEraNeighbors(db, args.currentNameLower, args.sex, args.peakYear, 4),
    listCurrentAlternatives(db, args.currentNameLower, args.sex, 4),
  ]);

  const seen = new Set<string>([args.currentNameLower]);
  const dedupe = (items: NameDiscoveryCard[]): NameDiscoveryCard[] => {
    const out: NameDiscoveryCard[] = [];
    for (const item of items) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  const clusters: NameDiscoveryCluster[] = [
    { kind: "same-status", title: "Same status", items: dedupe(sameStatus) },
    { kind: "same-era", title: "From the same era", items: dedupe(sameEra) },
    { kind: "current-alternatives", title: "Popular alternatives now", items: dedupe(currentAlternatives) },
  ]
    .map((cluster) => ({
      ...cluster,
      kind: cluster.kind as NameDiscoveryClusterKind,
    }))
    .filter((cluster) => cluster.items.length > 0);

  return { clusters };
}

export async function listLanding(db: D1Database, kind: LandingKind, limit = 500): Promise<NameRow[]> {
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

// Sort keys map to a fixed, hardcoded ORDER BY clause — never interpolate a
// caller-supplied sort string directly.
const MOMENTUM_SORT_COLUMNS: Record<MomentumSort, string> = {
  momentum: "momentum DESC, name ASC",
  total: "total_count DESC, name ASC",
  eta: "eta_year IS NULL, eta_year ASC, momentum DESC",
  az: "name ASC",
};

export async function listMomentum(
  db: D1Database,
  direction: MomentumDirection,
  opts: { sex?: Sex; sort?: MomentumSort; limit?: number } = {},
): Promise<MomentumRow[]> {
  const sort = opts.sort ?? "momentum";
  const limit = opts.limit ?? 150;
  const orderBy = MOMENTUM_SORT_COLUMNS[sort];

  const sexClause = opts.sex ? "AND sex = ?2" : "";
  const bindings: (string | number)[] = opts.sex
    ? [direction, opts.sex, limit]
    : [direction, limit];

  const r = await db
    .prepare(
      `SELECT name, sex, first_year, peak_year, peak_count, total_count,
              y1, y2, y3, y4, y5, momentum, eta_year, window_start, window_end
         FROM name_momentum
        WHERE direction = ?1 ${sexClause}
        ORDER BY ${orderBy}
        LIMIT ?${opts.sex ? 3 : 2}`,
    )
    .bind(...bindings)
    .all<{
      name: string;
      sex: Sex;
      first_year: number;
      peak_year: number;
      peak_count: number;
      total_count: number;
      y1: number;
      y2: number;
      y3: number;
      y4: number;
      y5: number;
      momentum: number;
      eta_year: number | null;
      window_start: number;
      window_end: number;
    }>();

  return (r.results ?? []).map((row) => ({
    name: row.name,
    sex: row.sex,
    firstYear: row.first_year,
    peakYear: row.peak_year,
    peakCount: row.peak_count,
    totalCount: row.total_count,
    y1: row.y1,
    y2: row.y2,
    y3: row.y3,
    y4: row.y4,
    y5: row.y5,
    momentum: row.momentum,
    etaYear: row.eta_year,
    windowStart: row.window_start,
    windowEnd: row.window_end,
  }));
}

export interface DominantNameWithSpark {
  name: string;
  name_lower: string;
  sex: Sex;
  total_count: number;
  spark_blob: ArrayBuffer;
}

export async function listDominantNamesWithSparks(
  db: D1Database,
  names: string[],
): Promise<DominantNameWithSpark[]> {
  const normalizedNames = [...new Set(names.map((name) => name.toLowerCase()))];
  if (normalizedNames.length === 0) return [];

  const placeholders = normalizedNames.map((_, index) => `?${index + 1}`).join(", ");
  const r = await db
    .prepare(
      `WITH ranked AS (
         SELECT name, name_lower, sex, total_count, spark_blob, peak_count,
                ROW_NUMBER() OVER (
                  PARTITION BY name_lower
                  ORDER BY total_count DESC, peak_count DESC, sex
                ) AS rn
           FROM names
          WHERE name_lower IN (${placeholders})
            AND spark_blob IS NOT NULL
       )
       SELECT name, name_lower, sex, total_count, spark_blob
         FROM ranked
        WHERE rn = 1`,
    )
    .bind(...normalizedNames)
    .all<DominantNameWithSpark>();
  return r.results ?? [];
}

export interface YearTotal {
  year: number;
  sex: Sex;
  total: number;
}

export async function listYearTotals(db: D1Database): Promise<YearTotal[]> {
  const r = await db.prepare(`SELECT year, sex, total FROM year_totals ORDER BY year`).all<YearTotal>();
  return r.results ?? [];
}

export interface TopByYear {
  year: number;
  sex: Sex;
  name: string;
  count: number;
}

// The set of years that have data, read from the small year_totals table
// (~290 rows). Used to drive per-year ranking without scanning name_years.
async function listDataYears(db: D1Database): Promise<number[]> {
  const r = await db
    .prepare(`SELECT DISTINCT year FROM year_totals ORDER BY year`)
    .all<{ year: number }>();
  return (r.results ?? []).map((row) => row.year);
}

// How many per-year ranking statements to pipeline in a single db.batch().
const YEAR_BATCH = 24;

// Reads of `name_rankings_by_year` (migration 0022). The table is a cache of
// the window-function queries below, so every reader degrades to the live query
// when it cannot be served: the table may be absent (migration not applied),
// not yet published for the live dataset (backfill not run, or a rebuild in
// flight), or too shallow (caller wants a deeper rank than
// RANKINGS_PER_SEX_LIMIT).
//
// The readiness marker matters as much as the table's existence: a rebuild
// writes years in batches, and serving a half-built table would let /api/meta
// return only the years written so far — into a response that is then
// edge-cached for seven days. rankingsReady() only reports true once a rebuild
// has been published in full for the current data_version.
async function rankingsUsable(db: D1Database, perBucket: number): Promise<boolean> {
  if (perBucket > RANKINGS_PER_SEX_LIMIT) return false;
  try {
    return await rankingsReady(db);
  } catch {
    // meta or the rankings table does not exist on this database yet.
    return false;
  }
}

async function topByYearPrecomputed(db: D1Database, perBucket: number): Promise<TopByYear[] | null> {
  if (!(await rankingsUsable(db, perBucket))) return null;
  const r = await db
    .prepare(
      // ORDER BY rank first matches the name_rankings_rank covering index, so
      // this is a range scan with no sort. Callers bucket by year and only care
      // that each year's rows arrive in rank order, which this preserves.
      `SELECT year, sex, name, count
         FROM name_rankings_by_year
        WHERE rank <= ?1
        ORDER BY rank, year, sex`,
    )
    .bind(perBucket)
    .all<{ year: number; sex: Sex; name: string; count: number }>();
  const rows = r.results ?? [];
  if (!rows.length) return null;
  return rows.map((row) => ({ year: row.year, sex: row.sex, name: row.name, count: row.count }));
}

// Returns the top-N per (year, sex). Used by /api/meta to populate the
// "popular right now" grid on the home page.
//
// Ranking is done one year at a time and pipelined through db.batch(). A single
// window function partitioned over the *whole* name_years table (~2M rows) has
// to materialize and sort every row at once, which blows past the Worker
// memory/CPU budget that D1 executes under and surfaces as Cloudflare Error
// 1101 on a cache miss. Each per-year statement instead filters on
// `WHERE ny.year = ?`, hits the name_years(year, count DESC) index, and only
// ever holds one year's rows in memory — so peak memory stays bounded no matter
// how large the table grows.
export async function topByYear(db: D1Database, perBucket = 10): Promise<TopByYear[]> {
  const precomputed = await topByYearPrecomputed(db, perBucket);
  if (precomputed) return precomputed;

  const years = await listDataYears(db);
  if (!years.length) return [];

  const out: TopByYear[] = [];
  for (let i = 0; i < years.length; i += YEAR_BATCH) {
    const slice = years.slice(i, i + YEAR_BATCH);
    const batch = slice.map((year) =>
      db
        .prepare(
          `WITH ranked AS (
             SELECT n.name, n.sex, ny.count,
                    ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY ny.count DESC) AS rn
               FROM name_years ny
               JOIN names n ON n.id = ny.name_id
              WHERE ny.year = ?1
           )
           SELECT name, sex, count
             FROM ranked
            WHERE rn <= ?2
            ORDER BY sex, count DESC`,
        )
        .bind(year, perBucket),
    );
    const results = await db.batch<{ name: string; sex: Sex; count: number }>(batch);
    results.forEach((res, idx) => {
      const year = slice[idx]!;
      for (const row of res.results ?? []) {
        out.push({ year, sex: row.sex, name: row.name, count: row.count });
      }
    });
  }
  return out;
}

export interface YearTopRow {
  name: string;
  sex: Sex;
  count: number;
  rank: number;
}

// Top-N names per sex for a specific birth year. Used by /api/year/:year.
// Uses a CTE so the per-sex rank filter happens before truncation — a plain
// ORDER BY sex + LIMIT would return only the first-sorted sex bucket.
export async function topBySpecificYear(db: D1Database, year: number, perSex = 25): Promise<YearTopRow[]> {
  if (await rankingsUsable(db, perSex)) {
    const pre = await db
      .prepare(
        `SELECT name, sex, count, rank
           FROM name_rankings_by_year
          WHERE year = ?1 AND rank <= ?2
          ORDER BY sex, rank`,
      )
      .bind(year, perSex)
      .all<YearTopRow>();
    if (pre.results?.length) return pre.results;
  }

  const r = await db
    .prepare(
      `WITH ranked AS (
         SELECT n.name, n.sex, ny.count,
                ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY ny.count DESC) AS rank
           FROM name_years ny
           JOIN names n ON n.id = ny.name_id
          WHERE ny.year = ?1
       )
       SELECT name, sex, count, rank
         FROM ranked
        WHERE rank <= ?2
        ORDER BY sex, rank`,
    )
    .bind(year, perSex)
    .all<YearTopRow>();
  return r.results ?? [];
}

export async function getTopNamesForYear(db: D1Database, year: number, perSex = 5): Promise<YearTopRow[]> {
  return topBySpecificYear(db, year, perSex);
}

export interface RankedYearRow {
  name: string;
  sex: Sex;
  year: number;
}

// Every (name, sex, year) that held a top-`perSex` position, ordered so the
// caller can group by (sex, name) and read each name's years ascending. Used by
// /api/top100-history to build contiguous year spans.
//
// The fallback deliberately does NOT reproduce the single global window
// function this used to run (`PARTITION BY ny.year, n.sex` over the whole of
// name_years): that materializes ~1.9M rows and is the Error 1101 shape
// documented above. It batches per year like the other rank readers.
export async function rankedNameYears(db: D1Database, perSex = 100): Promise<RankedYearRow[]> {
  if (await rankingsUsable(db, perSex)) {
    const pre = await db
      .prepare(
        `SELECT name, sex, year
           FROM name_rankings_by_year
          WHERE rank <= ?1
          ORDER BY sex, name, year`,
      )
      .bind(perSex)
      .all<RankedYearRow>();
    if (pre.results?.length) return pre.results;
  }

  const years = await listDataYears(db);
  if (!years.length) return [];

  const out: RankedYearRow[] = [];
  for (let i = 0; i < years.length; i += YEAR_BATCH) {
    const slice = years.slice(i, i + YEAR_BATCH);
    const batch = slice.map((year) =>
      db
        .prepare(
          `WITH ranked AS (
             SELECT n.name, n.sex,
                    ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY ny.count DESC, n.name ASC) AS rn
               FROM name_years ny
               JOIN names n ON n.id = ny.name_id
              WHERE ny.year = ?1
           )
           SELECT name, sex FROM ranked WHERE rn <= ?2`,
        )
        .bind(year, perSex),
    );
    const results = await db.batch<{ name: string; sex: Sex }>(batch);
    results.forEach((res, idx) => {
      const year = slice[idx]!;
      for (const row of res.results ?? []) out.push({ name: row.name, sex: row.sex, year });
    });
  }

  // The per-year path collects year-major; the caller needs (sex, name, year).
  out.sort((a, b) => a.sex.localeCompare(b.sex) || a.name.localeCompare(b.name) || a.year - b.year);
  return out;
}

export async function getYearTotalsForYears(db: D1Database, sex: Sex, years: number[]): Promise<YearTotal[]> {
  const uniqueYears = [...new Set(years.map((year) => Math.floor(year)).filter(Number.isFinite))];
  if (!uniqueYears.length) return [];

  // Batch the year IN list to stay under D1's deployed bound-variable ceiling.
  return chunkedIn<YearTotal>(
    db,
    uniqueYears,
    (ph) => `SELECT year, sex, total
         FROM year_totals
        WHERE sex = ?
          AND year IN (${ph})
        ORDER BY year`,
    { prefixBinds: [sex] },
  );
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
export async function listNameSparks(db: D1Database): Promise<SparkBlobRow[]> {
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

export interface DecodedSparkRow {
  name: string;
  sex: Sex;
  spark: number[];
}

// Cached variant of listNameSparks. Stores decoded sparks in caches.default
// keyed by dataVersion so repeated twin lookups skip the D1 scan.
export async function getCachedNameSparks(db: D1Database, dataVersion: string): Promise<DecodedSparkRow[]> {
  const cache = caches.default;
  const cacheKey = new Request(`https://internal/sparks/${dataVersion}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const json = (await cached.json()) as DecodedSparkRow[];
    return json;
  }

  const rows = await listNameSparks(db);
  const decoded: DecodedSparkRow[] = [];
  for (const r of rows) {
    if (!r.spark_blob) continue;
    decoded.push({ name: r.name, sex: r.sex, spark: decodeSpark(r.spark_blob) });
  }

  await cache.put(
    cacheKey,
    new Response(JSON.stringify(decoded), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  return decoded;
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

// Fetches the spark_blob for a specific name+sex pair (unlike getNameSpark,
// which picks whichever sex has more total births). Used by the premium
// report endpoint to compute trajectory similarity for each sex on record.
export async function getNameSparkForSex(
  db: D1Database,
  nameLower: string,
  sex: Sex,
): Promise<ArrayBuffer | null> {
  const r = await db
    .prepare(`SELECT spark_blob FROM names WHERE name_lower = ?1 AND sex = ?2`)
    .bind(nameLower, sex)
    .first<{ spark_blob: ArrayBuffer | null }>();
  return r?.spark_blob ?? null;
}

export interface RiverNameRow {
  name: string;
  sex: Sex;
  peakYear: number;
  peakCount: number;
  series: Record<number, number>;
}

// Names that have ever ranked top-N in some (year, sex). Two phases: first
// collect the qualifying name ids by ranking one year at a time, then pull the
// full (year, count) series for just those ids.
//
// Like topByYear, the id collection must not rank over the whole name_years
// table in a single window function — that materializes ~2M rows at once and
// exceeds the Worker memory budget D1 runs under (Cloudflare Error 1101). Each
// per-year statement filters on `WHERE ny.year = ?` (name_years(year, count
// DESC) index), keeping peak memory bounded, and is pipelined via db.batch().
// When name_rankings_by_year is available the whole first phase collapses to a
// single indexed read; the per-year window functions below are the fallback.
export async function riverNames(db: D1Database, perBucket = 30): Promise<RiverNameRow[]> {
  const ids = new Set<number>();

  if (await rankingsUsable(db, perBucket)) {
    const pre = await db
      .prepare(
        `SELECT DISTINCT n.id AS id
           FROM name_rankings_by_year r
           JOIN names n ON n.name = r.name AND n.sex = r.sex
          WHERE r.rank <= ?1`,
      )
      .bind(perBucket)
      .all<{ id: number }>();
    for (const row of pre.results ?? []) ids.add(row.id);
  }

  const years = ids.size ? [] : await listDataYears(db);
  if (!ids.size && !years.length) return [];

  for (let i = 0; i < years.length; i += YEAR_BATCH) {
    const slice = years.slice(i, i + YEAR_BATCH);
    const batch = slice.map((year) =>
      db
        .prepare(
          `WITH ranked AS (
             SELECT n.id AS id,
                    ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY ny.count DESC) AS rn
               FROM name_years ny
               JOIN names n ON n.id = ny.name_id
              WHERE ny.year = ?1
           )
           SELECT DISTINCT id FROM ranked WHERE rn <= ?2`,
        )
        .bind(year, perBucket),
    );
    const results = await db.batch<{ id: number }>(batch);
    for (const res of results) {
      for (const row of res.results ?? []) ids.add(row.id);
    }
  }
  if (!ids.size) return [];

  // Pull every (year, count) for the qualifying ids. The IN list is chunked to
  // stay under D1's bound-variable ceiling.
  const rows = await chunkedIn<{
    id: number;
    name: string;
    sex: Sex;
    peak_year: number;
    peak_count: number;
    year: number;
    count: number;
  }>(
    db,
    [...ids],
    (ph) => `SELECT n.id AS id, n.name AS name, n.sex AS sex,
                    n.peak_year AS peak_year, n.peak_count AS peak_count,
                    ny.year AS year, ny.count AS count
               FROM names n
               JOIN name_years ny ON ny.name_id = n.id
              WHERE n.id IN (${ph})
              ORDER BY n.id, ny.year`,
  );

  const grouped = new Map<number, RiverNameRow>();
  for (const row of rows) {
    let g = grouped.get(row.id);
    if (!g) {
      g = {
        name: row.name,
        sex: row.sex,
        peakYear: row.peak_year,
        peakCount: row.peak_count,
        series: {},
      };
      grouped.set(row.id, g);
    }
    g.series[row.year] = row.count;
  }
  return [...grouped.values()];
}

export interface DecadeTopRow {
  name: string;
  sex: Sex;
  decade_total: number;
  rank: number;
}

/** One (name, sex) row ranked inside an arbitrary year range. */
export interface YearRangeNameRow {
  name: string;
  sex: Sex;
  /** Recorded births inside the requested range. */
  window_total: number;
  /** Recorded births across the whole SSA span (1880–dataThroughYear). */
  lifetime_total: number;
  rank: number;
}

/**
 * Top names aggregated across an arbitrary inclusive year range (used by the
 * generation hubs, whose windows cross calendar decades). Mirrors
 * topByDecade's window-function shape but also returns each name's lifetime
 * total so "share of the generation's births" can be computed in one query.
 */
export async function topNamesInYearRange(
  db: D1Database,
  startYear: number,
  endYear: number,
  perSex = 25,
): Promise<YearRangeNameRow[]> {
  const r = await db
    .prepare(
      `WITH windowed AS (
         SELECT n.id, n.name, n.sex, n.total_count,
                SUM(ny.count) AS window_total,
                ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY SUM(ny.count) DESC) AS rank
           FROM name_years ny
           JOIN names n ON n.id = ny.name_id
          WHERE ny.year >= ?1 AND ny.year <= ?2
          GROUP BY n.id
       )
       SELECT name, sex, total_count AS lifetime_total, window_total, rank
         FROM windowed
        WHERE rank <= ?3
        ORDER BY sex, rank`,
    )
    .bind(startYear, endYear, perSex)
    .all<YearRangeNameRow>();
  return r.results ?? [];
}

/** Annual recorded births per sex across an inclusive year range. */
export async function yearRangeTotals(
  db: D1Database,
  startYear: number,
  endYear: number,
): Promise<YearTotal[]> {
  const r = await db
    .prepare(`SELECT year, sex, total FROM year_totals WHERE year >= ?1 AND year <= ?2 ORDER BY year`)
    .bind(startYear, endYear)
    .all<YearTotal>();
  return r.results ?? [];
}

export interface DecadeTopSparkRow {
  name: string;
  sex: Sex;
  decade_total: number;
  rank: number;
  spark: number[];
}

export interface InitialNameRow {
  name: string;
  sex: Sex;
  total_count: number;
  peak_year: number;
  latest_count: number;
  status: Status;
  rank: number;
}

export type EndingNameRow = InitialNameRow;

// Top names by first letter, ranked separately for each recorded sex.
export async function topByInitial(db: D1Database, initial: string, perSex = 25): Promise<InitialNameRow[]> {
  const letter = initial.toLowerCase();
  const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1);
  const cappedLimit = Math.max(1, Math.min(50, Math.floor(perSex)));
  const r = await db
    .prepare(
      `WITH ranked AS (
         SELECT name, sex, total_count, peak_year, latest_count, status,
                ROW_NUMBER() OVER (
                  PARTITION BY sex
                  ORDER BY total_count DESC, peak_count DESC, name
                ) AS rank
           FROM names
          WHERE name_lower >= ?1
            AND name_lower < ?2
       )
       SELECT name, sex, total_count, peak_year, latest_count, status, rank
         FROM ranked
        WHERE rank <= ?3
        ORDER BY sex, rank`,
    )
    .bind(letter, nextLetter, cappedLimit)
    .all<InitialNameRow>();
  return r.results ?? [];
}

// Top names by final letter, ranked separately for each recorded sex.
export async function topByEnding(db: D1Database, ending: string, perSex = 25): Promise<EndingNameRow[]> {
  const letter = ending.toLowerCase();
  const cappedLimit = Math.max(1, Math.min(50, Math.floor(perSex)));
  const r = await db
    .prepare(
      `WITH ranked AS (
         SELECT name, sex, total_count, peak_year, latest_count, status,
                ROW_NUMBER() OVER (
                  PARTITION BY sex
                  ORDER BY total_count DESC, peak_count DESC, name
                ) AS rank
           FROM names
          WHERE substr(name_lower, -1) = ?1
       )
       SELECT name, sex, total_count, peak_year, latest_count, status, rank
         FROM ranked
        WHERE rank <= ?2
        ORDER BY sex, rank`,
    )
    .bind(letter, cappedLimit)
    .all<EndingNameRow>();
  return r.results ?? [];
}

// ─── Blog ────────────────────────────────────────────────────────────────────

export async function listBlogPosts(
  db: D1Database,
  status: "draft" | "published" = "published",
  limit = 20,
  offset = 0,
): Promise<BlogPostSummary[]> {
  const r = await db
    .prepare(
      `SELECT slug, title, description, published_at AS publishedAt, author
         FROM blog_posts
        WHERE status = ?1
        ORDER BY published_at DESC
        LIMIT ?2 OFFSET ?3`,
    )
    .bind(status, limit, offset)
    .all<BlogPostSummary>();
  return r.results ?? [];
}

export async function getBlogPost(db: D1Database, slug: string): Promise<BlogPost | null> {
  const r = await db
    .prepare(
      `SELECT id, slug, title, description, body_html AS bodyHtml, body_md AS bodyMd,
              published_at AS publishedAt, created_at AS createdAt,
              updated_at AS updatedAt, status, author, og_image AS ogImage
         FROM blog_posts
        WHERE slug = ?1
          AND status = 'published'`,
    )
    .bind(slug)
    .first<BlogPost>();
  return r ?? null;
}

// ─── Blog admin ──────────────────────────────────────────────────────────────

export async function listAllBlogPostsAdmin(
  db: D1Database,
): Promise<import("./schema").BlogPostAdminSummary[]> {
  const r = await db
    .prepare(
      `SELECT slug, title, status, published_at AS publishedAt, updated_at AS updatedAt
         FROM blog_posts
        ORDER BY updated_at DESC`,
    )
    .all<import("./schema").BlogPostAdminSummary>();
  return r.results ?? [];
}

export async function getBlogPostAdmin(
  db: D1Database,
  slug: string,
): Promise<BlogPost | null> {
  const r = await db
    .prepare(
      `SELECT id, slug, title, description, body_html AS bodyHtml, body_md AS bodyMd,
              published_at AS publishedAt, created_at AS createdAt,
              updated_at AS updatedAt, status, author, og_image AS ogImage
         FROM blog_posts
        WHERE slug = ?1`,
    )
    .bind(slug)
    .first<BlogPost>();
  return r ?? null;
}

export async function deleteBlogPost(
  db: D1Database,
  slug: string,
): Promise<void> {
  await db.prepare(`DELETE FROM blog_posts WHERE slug = ?1`).bind(slug).run();
}

export async function upsertBlogPost(
  db: D1Database,
  post: {
    slug: string;
    title: string;
    description: string;
    bodyHtml: string;
    bodyMd?: string | null;
    status: "draft" | "published";
    author: string;
    ogImage?: string | null;
    publishedAt?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO blog_posts(slug, title, description, body_html, body_md, status, author, og_image, published_at, updated_at)
       VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))
       ON CONFLICT(slug) DO UPDATE SET
         title=excluded.title,
         description=excluded.description,
         body_html=excluded.body_html,
         body_md=excluded.body_md,
         status=excluded.status,
         author=excluded.author,
         og_image=excluded.og_image,
         published_at=excluded.published_at,
         updated_at=datetime('now')`,
    )
    .bind(
      post.slug,
      post.title,
      post.description,
      post.bodyHtml,
      post.bodyMd ?? null,
      post.status,
      post.author,
      post.ogImage ?? null,
      post.publishedAt ?? null,
    )
    .run();
}

// Top names aggregated across a calendar decade (inclusive start/end).
// Ranks per sex and returns the top N from each sex bucket.
export async function topByDecade(
  db: D1Database,
  startYear: number,
  endYear: number,
  perSex = 25,
): Promise<DecadeTopRow[]> {
  const r = await db
    .prepare(
      `WITH ranked AS (
         SELECT n.name, n.sex, SUM(ny.count) AS decade_total,
                ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY SUM(ny.count) DESC) AS rank
           FROM name_years ny
           JOIN names n ON n.id = ny.name_id
          WHERE ny.year >= ?1 AND ny.year <= ?2
          GROUP BY n.id
       )
       SELECT name, sex, decade_total, rank
         FROM ranked
        WHERE rank <= ?3
        ORDER BY sex, rank`,
    )
    .bind(startYear, endYear, perSex)
    .all<DecadeTopRow>();
  return r.results ?? [];
}

// Top names aggregated across a calendar decade, including the normalized
// spark_blob so the homepage tapestry can render real trend lines without
// fetching each name's full time series. Ranks across sexes (coed).
export async function topByDecadeWithSpark(
  db: D1Database,
  startYear: number,
  endYear: number,
  limit = 5,
): Promise<DecadeTopSparkRow[]> {
  const r = await db
    .prepare(
      `WITH ranked AS (
         SELECT n.name, n.sex, SUM(ny.count) AS decade_total,
                ROW_NUMBER() OVER (ORDER BY SUM(ny.count) DESC) AS rank,
                n.spark_blob
           FROM name_years ny
           JOIN names n ON n.id = ny.name_id
          WHERE ny.year >= ?1 AND ny.year <= ?2
          GROUP BY n.id
       )
       SELECT name, sex, decade_total, rank, spark_blob
         FROM ranked
        WHERE rank <= ?3
        ORDER BY rank`,
    )
    .bind(startYear, endYear, Math.max(1, limit))
    .all<DecadeTopRow & { spark_blob: ArrayBuffer | null }>();
  return (r.results ?? []).map((row) => ({
    name: row.name,
    sex: row.sex,
    decade_total: row.decade_total,
    rank: row.rank,
    spark: row.spark_blob ? decodeSpark(row.spark_blob) : [],
  }));
}

// Enrichment System: read the four precomputed dossier layers for one
// (name_lower, sex) in a single round of parallel queries. All heavy
// computation happens offline in scripts/build-enrichment.ts — this only
// reads rows.
export async function getNameEnrichmentBundle(
  db: D1Database,
  nameLower: string,
  sex: Sex,
): Promise<NameEnrichmentBundle> {
  const [profile, catalysts, historical, anomalies] = await Promise.all([
    db
      .prepare(
        `SELECT name_lower, sex, total_living_est, median_age, age_range_low,
                age_range_high, wave_topology, latest_pct, analysis_year, source_version
           FROM name_enrichment_profiles
          WHERE name_lower = ?1 AND sex = ?2`,
      )
      .bind(nameLower, sex)
      .first<NameEnrichmentProfile>(),
    db
      .prepare(
        `SELECT trigger_year, catalyst_title, catalyst_type, impact_score, description, source_url
           FROM name_catalysts
          WHERE name_lower = ?1 AND sex = ?2
          ORDER BY trigger_year ASC`,
      )
      .bind(nameLower, sex)
      .all<NameCatalyst>(),
    db
      .prepare(
        `SELECT era_year, top_occupations, primary_region, urban_vs_rural
           FROM name_historical_profiles
          WHERE name_lower = ?1 AND sex = ?2
          ORDER BY era_year ASC`,
      )
      .bind(nameLower, sex)
      .all<{
        era_year: number;
        top_occupations: string;
        primary_region: string;
        urban_vs_rural: string;
      }>(),
    db
      .prepare(
        `SELECT state, era_start_year, location_quotient, name_births, historical_peak_year, anomaly_type
           FROM name_regional_anomalies
          WHERE name_lower = ?1 AND sex = ?2
          ORDER BY location_quotient DESC
          LIMIT 3`,
      )
      .bind(nameLower, sex)
      .all<NameRegionalAnomaly>(),
  ]);

  return {
    profile: profile ?? null,
    catalysts: catalysts.results ?? [],
    historicalProfiles: (historical.results ?? []).map((row) => ({
      era_year: row.era_year,
      primary_region: row.primary_region,
      urban_vs_rural: row.urban_vs_rural,
      top_occupations: parseOccupations(row.top_occupations),
    })),
    regionalAnomalies: anomalies.results ?? [],
  };
}

function parseOccupations(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

// Reads the precomputed diaspora summary for one (name, sex) and parses its
// JSON columns into the API/SSR contract. Returns null when not computed.
export async function getNameDiaspora(db: D1Database, nameLower: string, sex: Sex): Promise<DiasporaResponse | null> {
  const row = await db
    .prepare(
      `SELECT name, name_lower, sex, origin_state, origin_year, peak_national_year,
              spread_json, never_adopted, total_states, diffusion_years
         FROM name_diaspora
        WHERE name_lower = ?1 AND sex = ?2`,
    )
    .bind(nameLower, sex)
    .first<NameDiasporaRow>();
  if (!row) return null;

  const spread = parseJsonArray<DiasporaSpreadPoint>(row.spread_json);
  const neverAdopted = parseJsonArray<string>(row.never_adopted);
  return {
    name: row.name,
    sex: row.sex,
    origin: row.origin_state && row.origin_year !== null ? { state: row.origin_state, year: row.origin_year } : null,
    peakNationalYear: row.peak_national_year,
    spread,
    neverAdopted,
    totalStates: row.total_states,
    diffusionYears: row.diffusion_years,
  };
}


// Reads a name's present-day "strongholds": the states where it is most
// over-represented in the dataset's latest era. Powers the /name page's "Where
// it lives now" map for legacy (pre-1910) names. The enrichment build preserves
// latest-era rows independently of its all-time top three; if this name has no
// qualifying row in the global latest era, return no map instead of falling
// back to historical geography.
export async function getNameStrongholds(
  db: D1Database,
  nameLower: string,
  sex: Sex,
): Promise<NameRegionalAnomaly[]> {
  const r = await db
    .prepare(
      `SELECT state, era_start_year, location_quotient, name_births, historical_peak_year, anomaly_type
         FROM name_regional_anomalies
        WHERE name_lower = ?1 AND sex = ?2
          AND era_start_year = (
            SELECT MAX(era_start_year) FROM name_regional_anomalies
          )
          AND location_quotient >= 1.2
        ORDER BY location_quotient DESC
        LIMIT 12`,
    )
    .bind(nameLower, sex)
    .all<NameRegionalAnomaly>();
  return r.results ?? [];
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
