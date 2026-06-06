// GET /api/living-treemap?limit=500&sex=F|M|all
// Returns the top names by estimated living population for the treemap viz.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface TreemapRow {
  name: string;
  sex: string;
  totalLivingEst: number;
  medianAge: number;
  ageRangeLow: number;
  ageRangeHigh: number;
  waveTopology: string;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 300, 1000);
  const sexFilter = (url.searchParams.get("sex") ?? "all").toUpperCase();

  let whereClause = "";
  const binds: (string | number)[] = [limit];
  if (sexFilter === "M" || sexFilter === "F") {
    whereClause = "WHERE sex = ?2";
    binds.push(sexFilter);
  }

  const rows = await ctx.env.DB.prepare(
    `SELECT name_lower AS name, sex, total_living_est, median_age,
            age_range_low, age_range_high, wave_topology
       FROM name_enrichment_profiles
      ${whereClause}
      ORDER BY total_living_est DESC
      LIMIT ?1`,
  )
    .bind(...binds)
    .all();

  const names: TreemapRow[] = (rows.results ?? []).map((r: Record<string, unknown>) => ({
    name: String(r.name),
    sex: String(r.sex),
    totalLivingEst: Number(r.total_living_est),
    medianAge: Number(r.median_age),
    ageRangeLow: Number(r.age_range_low),
    ageRangeHigh: Number(r.age_range_high),
    waveTopology: String(r.wave_topology),
  }));

  return Response.json(
    { names },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    },
  );
};
