// GET /api/decade/:decade
// Top baby names for a calendar decade (e.g. 1980s).
// Aggregates counts across all years in the decade and ranks per sex.

import { getMeta, topByDecade, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function parseDecade(raw: string): { label: string; start: number; end: number } | null {
  const m = /^((?:18|19|20)\d{2})s$/.exec(raw);
  if (!m) return null;
  const start = Number(m[1]);
  return { label: `${start}s`, start, end: start + 9 };
}

export const onRequestGet: PagesFunction<Env, "decade"> = async (ctx) => {
  const raw = ctx.params.decade;
  if (typeof raw !== "string") {
    return new Response("bad request", { status: 400 });
  }

  const decade = parseDecade(raw);
  if (!decade) {
    return new Response("decade must be like 1980s", { status: 400 });
  }

  const [rows, yMStr, ymStr] = await Promise.all([
    topByDecade(ctx.env.DB, decade.start, decade.end, 25),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  if (decade.start > yM || decade.end < ym) {
    return Response.json(
      { error: `No data for ${decade.label}. Available: ${ym}–${yM}.` },
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!rows.length) {
    return Response.json(
      { error: `No data found for ${decade.label}.` },
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  return Response.json(
    { decade: decade.label, startYear: decade.start, endYear: decade.end, ym, yM, rows },
    {
      headers: {
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
};
