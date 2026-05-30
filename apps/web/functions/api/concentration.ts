// GET /api/concentration
// Naming diversity metrics per year and sex.
// HHI = sum of squared market shares — measures concentration.
// Also returns top-1 and top-10 shares, and unique name count.
// Reveals the collapse of Mary's empire and the rise of radical diversity.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface ConcentrationYear {
  year: number;
  sex: "M" | "F";
  hhi: number;         // Herfindahl-Hirschman Index (0–1; 1 = monopoly)
  top1Share: number;   // share of births held by #1 name (0–1)
  top10Share: number;  // share held by top 10 names combined
  uniqueNames: number; // count of distinct names with ≥5 births
  total: number;       // total births that year
}

interface ConcentrationResponse {
  ym: number;
  yM: number;
  data: ConcentrationYear[];
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
  const cacheKey = new Request(`https://internal/concentration/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Heavy query: compute HHI, top-1-share, top-10-share, unique names per year/sex.
  // Uses year_totals for the denominator (total births per year/sex).
  const rows = await ctx.env.DB.prepare(
    `WITH ranked AS (
       SELECT ny.year, n.sex, ny.count,
              ROW_NUMBER() OVER (PARTITION BY ny.year, n.sex ORDER BY ny.count DESC) AS rn
         FROM name_years ny
         JOIN names n ON n.id = ny.name_id
     ),
     yt AS (
       SELECT year, sex, total FROM year_totals
     )
     SELECT r.year, r.sex,
            SUM(CAST(r.count AS REAL) * r.count) / (yt.total * yt.total) AS hhi,
            SUM(CASE WHEN r.rn = 1 THEN r.count ELSE 0 END) * 1.0 / yt.total AS top1_share,
            SUM(CASE WHEN r.rn <= 10 THEN r.count ELSE 0 END) * 1.0 / yt.total AS top10_share,
            COUNT(*) AS unique_names,
            yt.total AS total
       FROM ranked r
       JOIN yt ON yt.year = r.year AND yt.sex = r.sex
      GROUP BY r.year, r.sex, yt.total
      ORDER BY r.year, r.sex`,
  ).all<{
    year: number;
    sex: "M" | "F";
    hhi: number;
    top1_share: number;
    top10_share: number;
    unique_names: number;
    total: number;
  }>();

  const data: ConcentrationYear[] = (rows.results ?? []).map((r) => ({
    year: r.year,
    sex: r.sex,
    hhi: r.hhi,
    top1Share: r.top1_share,
    top10Share: r.top10_share,
    uniqueNames: r.unique_names,
    total: r.total,
  }));

  const body: ConcentrationResponse = { ym, yM, data };
  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
