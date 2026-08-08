// GET /api/debuts/:year
// All names appearing in the SSA database for the first time in the given
// year (first_year = year). These are names that crossed the 5-birth
// reporting threshold for the first time — genuine linguistic novelties,
// celebrity imports, invented spellings, or names crossing in from other
// language communities.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface DebutName {
  name: string;
  sex: "M" | "F";
  count: number; // births in debut year
  totalCount: number;
}

interface DebutsResponse {
  year: number;
  ym: number;
  yM: number;
  total: number;
  F: DebutName[];
  M: DebutName[];
}

export const onRequestGet: PagesFunction<Env, "year"> = async (ctx) => {
  const raw = ctx.params.year;
  if (typeof raw !== "string") return new Response("bad request", { status: 400 });

  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1880 || year > 2100) {
    return new Response("year must be 1880–present", { status: 400 });
  }

  const [yMStr, ymStr] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  if (year > yM || year < ym) {
    return new Response(
      JSON.stringify({ error: `No data for ${year}. Available: ${ym}–${yM}.` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const rows = await ctx.env.DB.prepare(
    `SELECT n.name, n.sex, ny.count AS count, n.total_count
       FROM names n
       JOIN name_years ny ON ny.name_id = n.id AND ny.year = ?1
      WHERE n.first_year = ?1
      ORDER BY ny.count DESC, n.total_count DESC, n.name`,
  )
    .bind(year)
    .all<{ name: string; sex: "M" | "F"; count: number; total_count: number }>();

  const all = rows.results ?? [];
  const F: DebutName[] = all
    .filter((r) => r.sex === "F")
    .map((r) => ({ name: r.name, sex: r.sex, count: r.count, totalCount: r.total_count }));
  const M: DebutName[] = all
    .filter((r) => r.sex === "M")
    .map((r) => ({ name: r.name, sex: r.sex, count: r.count, totalCount: r.total_count }));

  const body: DebutsResponse = { year, ym, yM, total: all.length, F, M };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
