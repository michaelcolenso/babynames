// HTTP API worker for prefix search over the baby-names database.
//
//   GET /search?q=<prefix>&limit=10
//
// Returns up to N name+sex matches ordered by peak popularity. Backed by
// the (name_lower, peak_count DESC) composite index — sub-50ms even
// across 100k rows.

import { searchByPrefix } from "@nv/shared";
import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname !== "/search") {
      return new Response("not found\n", { status: 404 });
    }

    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.max(1, Math.min(25, Number(url.searchParams.get("limit") ?? 10)));

    if (q.length < 2) {
      return Response.json(
        { q, results: [] },
        {
          headers: {
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
            "Content-Type": "application/json; charset=utf-8",
          },
        },
      );
    }

    try {
      const hits = await searchByPrefix(env.DB, q, limit);
      return Response.json(
        { q, results: hits },
        {
          headers: {
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
            "Content-Type": "application/json; charset=utf-8",
          },
        },
      );
    } catch (err) {
      console.error("search error", err);
      return Response.json(
        { error: "search_failed", message: err instanceof Error ? err.message : "unknown" },
        { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
      );
    }
  },
};
