// GET /api/ai-search?q=<query>&limit=8
//
// Semantic / hybrid search over indexed Name Vitals content (blog posts, name
// and era pages) via the Cloudflare AI Search Workers binding. Returns ranked
// source chunks with scores — distinct from /api/search, which is a fast D1
// prefix autocomplete over the names table.

import type { PagesFunction } from "@cloudflare/workers-types";
import { CACHE_HEADERS, JSON_HEADERS, clampLimit, toCitation } from "./_shared";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = clampLimit(url.searchParams.get("limit"));

  if (q.length < 2) {
    return Response.json({ q, results: [] }, { headers: CACHE_HEADERS });
  }

  try {
    const res = await ctx.env.AI_SEARCH.search({
      query: q,
      ai_search_options: {
        retrieval: { retrieval_type: "hybrid", max_num_results: limit },
      },
    });
    const results = (res.chunks ?? []).map(toCitation);
    return Response.json({ q, results }, { headers: CACHE_HEADERS });
  } catch (err) {
    console.error("ai-search error", err);
    return Response.json(
      { error: "ai_search_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 502, headers: JSON_HEADERS },
    );
  }
};
