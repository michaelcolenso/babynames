// GET /api/suffix-waves
// Annual birth counts grouped by name ending (last 3 chars) per sex.
// Returns only the top-N suffixes by all-time births, suitable for a streamgraph.
// The -ayden wave, the -ella renaissance, the -lyn era: linguistic epidemics, quantified.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface SuffixWavesResponse {
  ym: number;
  yM: number;
  // suffixes: sorted by all-time total births (desc)
  suffixes: string[];
  // years: sorted ascending
  years: number[];
  // F[year_index][suffix_index] = birth_count
  F: number[][];
  // M[year_index][suffix_index] = birth_count
  M: number[][];
}

const TOP_N = 20;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [yMStr, ymStr, dataVersion] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  const cache = caches.default;
  const cacheKey = new Request(`https://internal/suffix-waves/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Aggregate by suffix (last 3 chars), year, sex
  const rows = await ctx.env.DB.prepare(
    `SELECT UPPER(SUBSTR(n.name, -3)) AS suffix,
            ny.year, n.sex,
            SUM(ny.count) AS count
       FROM name_years ny
       JOIN names n ON n.id = ny.name_id
      GROUP BY suffix, ny.year, n.sex
      ORDER BY suffix, ny.year, n.sex`,
  ).all<{ suffix: string; year: number; sex: "M" | "F"; count: number }>();

  const all = rows.results ?? [];

  // Find top-N suffixes by total births (both sexes combined)
  const suffixTotals = new Map<string, number>();
  for (const r of all) {
    suffixTotals.set(r.suffix, (suffixTotals.get(r.suffix) ?? 0) + r.count);
  }
  const topSuffixes = [...suffixTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([s]) => s);
  const suffixSet = new Set(topSuffixes);

  // Collect all years
  const yearSet = new Set<number>();
  for (const r of all) yearSet.add(r.year);
  const years = [...yearSet].sort((a, b) => a - b);
  const yearIdx = new Map(years.map((y, i) => [y, i]));
  const suffixIdx = new Map(topSuffixes.map((s, i) => [s, i]));

  // Build 2D arrays: [year_index][suffix_index]
  const F: number[][] = years.map(() => new Array(TOP_N).fill(0));
  const M: number[][] = years.map(() => new Array(TOP_N).fill(0));

  for (const r of all) {
    if (!suffixSet.has(r.suffix)) continue;
    const yi = yearIdx.get(r.year)!;
    const si = suffixIdx.get(r.suffix)!;
    if (r.sex === "F") F[yi]![si] = r.count;
    else M[yi]![si] = r.count;
  }

  const body: SuffixWavesResponse = { ym, yM, suffixes: topSuffixes, years, F, M };
  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
