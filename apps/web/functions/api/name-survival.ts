// GET /api/name-survival
// Kaplan-Meier-style survival analysis for naming cohorts.
// For names debuting in each decade, what fraction are still "alive"
// (appearing in the SSA data with ≥5 births) at each subsequent year?
// Reveals the accelerating extinction rate of modern names vs pre-war durability.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface SurvivalPoint {
  decade: number;   // debut decade (1880, 1890, …)
  sex: "M" | "F";
  offset: number;   // years since debut decade started
  rate: number;     // fraction surviving (0–1)
  alive: number;    // count of names still appearing
  cohortSize: number;
}

interface NameSurvivalResponse {
  ym: number;
  yM: number;
  data: SurvivalPoint[];
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [yMStr, ymStr, dataVersion] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  const cache = caches.default;
  const cacheKey = new Request(`https://internal/name-survival/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // For each (cohort_decade, sex, year) compute alive count and total cohort size.
  // A name is "alive" in a year if it has a name_years record (count ≥ 5 by SSA definition).
  const rows = await ctx.env.DB.prepare(
    `WITH cohorts AS (
       SELECT n.id, n.sex,
              (n.first_year / 10 * 10) AS cohort_decade
         FROM names n
        WHERE n.first_year >= 1880 AND n.first_year <= ?1
     ),
     sizes AS (
       SELECT cohort_decade, sex, COUNT(*) AS total
         FROM cohorts
        GROUP BY cohort_decade, sex
     ),
     appearances AS (
       SELECT c.cohort_decade, c.sex, ny.year,
              COUNT(*) AS alive
         FROM cohorts c
         JOIN name_years ny ON ny.name_id = c.id
        GROUP BY c.cohort_decade, c.sex, ny.year
     )
     SELECT a.cohort_decade, a.sex, a.year,
            a.alive, s.total AS cohort_size,
            CAST(a.alive AS REAL) / s.total AS rate,
            (a.year - a.cohort_decade) AS offset
       FROM appearances a
       JOIN sizes s ON s.cohort_decade = a.cohort_decade AND s.sex = a.sex
      WHERE a.year >= a.cohort_decade
        AND (a.year - a.cohort_decade) <= 140
      ORDER BY a.cohort_decade, a.sex, a.year`,
  )
    .bind(yM - 5)
    .all<{
      cohort_decade: number;
      sex: "M" | "F";
      year: number;
      alive: number;
      cohort_size: number;
      rate: number;
      offset: number;
    }>();

  const data: SurvivalPoint[] = (rows.results ?? []).map((r) => ({
    decade: r.cohort_decade,
    sex: r.sex,
    offset: r.offset,
    rate: Math.round(r.rate * 10000) / 10000,
    alive: r.alive,
    cohortSize: r.cohort_size,
  }));

  const body: NameSurvivalResponse = { ym, yM, data };
  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
