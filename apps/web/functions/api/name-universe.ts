// GET /api/name-universe
// Returns every name above a minimum threshold with fields needed for the
// galaxy visualization: debut year, peak year, peak count, sex, status.
// Used to render 20k+ "stars" in the Name Universe canvas visualization.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface UniverseName {
  n: string;       // name
  s: "M" | "F";   // sex
  fy: number;      // first_year (debut)
  py: number;      // peak_year
  pc: number;      // peak_count
  st: string;      // status (first char: r=rising, s=stable, d=declining, e=endangered, x=extinct)
}

interface NameUniverseResponse {
  ym: number;
  yM: number;
  names: UniverseName[];
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
  const cacheKey = new Request(`https://internal/name-universe/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const rows = await ctx.env.DB.prepare(
    `SELECT name, sex, first_year, peak_year, peak_count, status
       FROM names
      WHERE peak_count >= 20
      ORDER BY peak_count DESC`,
  ).all<{ name: string; sex: "M" | "F"; first_year: number; peak_year: number; peak_count: number; status: string }>();

  const names: UniverseName[] = (rows.results ?? []).map((r) => ({
    n: r.name,
    s: r.sex,
    fy: r.first_year,
    py: r.peak_year,
    pc: r.peak_count,
    st: r.status.charAt(0), // first char only
  }));

  const body: NameUniverseResponse = { ym, yM, names };
  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
