// GET /api/movers/:year
// Year-over-year rank changes for top 100 names vs. the prior year.
// Used by the journalist press page to surface biggest gainers, losers, and new entrants.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface MoverRow {
  name: string;
  sex: "M" | "F";
  count: number;
  rank: number;
  prevCount: number | null;
  prevRank: number | null;
  rankChange: number | null; // positive = rank improved (lower number is better)
}

interface MoversResponse {
  year: number;
  prevYear: number;
  all: MoverRow[];
  gainers: MoverRow[];
  losers: MoverRow[];
  newEntrants: MoverRow[];
}

export const onRequestGet: PagesFunction<Env, "year"> = async (ctx) => {
  const raw = ctx.params.year;
  if (typeof raw !== "string") return new Response("bad request", { status: 400 });

  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1881 || year > 2100) {
    return new Response("year must be 1881–present", { status: 400 });
  }

  const [yMStr, ymStr] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  if (year > yM || year <= ym) {
    return new Response(
      JSON.stringify({ error: `No comparison data for ${year}. Available: ${ym + 1}–${yM}.` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const prevYear = year - 1;

  const rows = await ctx.env.DB.prepare(
    `WITH this_year AS (
       SELECT n.name, n.sex, ny.count,
              ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY ny.count DESC) AS rank
         FROM name_years ny
         JOIN names n ON n.id = ny.name_id
        WHERE ny.year = ?1
     ),
     prev_year AS (
       SELECT n.name, n.sex, ny.count,
              ROW_NUMBER() OVER (PARTITION BY n.sex ORDER BY ny.count DESC) AS rank
         FROM name_years ny
         JOIN names n ON n.id = ny.name_id
        WHERE ny.year = ?2
     )
     SELECT
       t.name, t.sex, t.count, CAST(t.rank AS INTEGER) AS rank,
       p.count AS prev_count, CAST(p.rank AS INTEGER) AS prev_rank
       FROM this_year t
       LEFT JOIN prev_year p ON p.name = t.name AND p.sex = t.sex
      WHERE t.rank <= 100
      ORDER BY t.sex, t.rank`,
  )
    .bind(year, prevYear)
    .all<{
      name: string;
      sex: "M" | "F";
      count: number;
      rank: number;
      prev_count: number | null;
      prev_rank: number | null;
    }>();

  const all: MoverRow[] = (rows.results ?? []).map((r) => ({
    name: r.name,
    sex: r.sex,
    count: r.count,
    rank: r.rank,
    prevCount: r.prev_count,
    prevRank: r.prev_rank,
    rankChange: r.prev_rank != null ? r.prev_rank - r.rank : null,
  }));

  const gainers = [...all]
    .filter((r) => r.rankChange !== null && r.rankChange > 0)
    .sort((a, b) => (b.rankChange ?? 0) - (a.rankChange ?? 0))
    .slice(0, 10);

  const losers = [...all]
    .filter((r) => r.rankChange !== null && r.rankChange < 0)
    .sort((a, b) => (a.rankChange ?? 0) - (b.rankChange ?? 0))
    .slice(0, 10);

  const newEntrants = all.filter((r) => r.prevRank == null || r.prevRank > 100);

  const body: MoversResponse = { year, prevYear, all, gainers, losers, newEntrants };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
