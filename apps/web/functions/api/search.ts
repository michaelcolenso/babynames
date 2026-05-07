// GET /api/search?q=<prefix>&limit=10
// Returns up to N name+sex matches ordered by peak popularity. Backed by
// the (name_lower, peak_count DESC) composite index — sub-50ms even
// across 100k rows.

import { searchByPrefix } from "@nv/shared";
import type { PagesFunction, D1Database } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.max(1, Math.min(25, Number(url.searchParams.get("limit") ?? 10)));
  if (q.length < 2) {
    return Response.json({ q, results: [] }, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const hits = await searchByPrefix(ctx.env.DB, q, limit);
  return Response.json(
    { q, results: hits },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
};
