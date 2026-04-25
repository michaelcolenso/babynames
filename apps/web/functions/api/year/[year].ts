// GET /api/year/:year
// Top baby names for a specific birth year — the "what were the popular names
// the year you were born?" feature. Classic viral bait.

import { getMeta, topBySpecificYear, META_KEYS } from "@nv/shared";
import type { PagesFunction, D1Database } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env, "year"> = async (ctx) => {
  const raw = ctx.params.year;
  if (typeof raw !== "string") return new Response("bad request", { status: 400 });

  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1880 || year > 2100) {
    return new Response("year must be 1880–present", { status: 400 });
  }

  const [rows, yMStr, ymStr] = await Promise.all([
    topBySpecificYear(ctx.env.DB, year, 25),
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

  if (!rows.length) {
    return new Response(
      JSON.stringify({ error: `No data found for ${year}.` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return Response.json(
    { year, ym, yM, rows },
    {
      headers: {
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
};
