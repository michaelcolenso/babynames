// GET  /api/ai-search/ask?q=<question>&limit=8
// POST /api/ai-search/ask   { "question": "...", "limit": 8 }
//
// RAG-style natural-language answer with source citations, generated from
// indexed content via the Cloudflare AI Search chatCompletions() binding.

import type { PagesFunction } from "@cloudflare/workers-types";
import { JSON_HEADERS, clampLimit, toCitation } from "./_shared";

// Answers are reasonably stable and the corpus only changes on re-index, so a
// short edge cache smooths repeated questions without staleness concerns.
const ASK_HEADERS = {
  ...JSON_HEADERS,
  "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
};

const MIN_QUESTION_LEN = 3;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  return run(ctx.env, q, clampLimit(url.searchParams.get("limit")));
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: { question?: string; q?: string; limit?: number };
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: JSON_HEADERS });
  }
  const q = (body.question ?? body.q ?? "").trim();
  return run(ctx.env, q, clampLimit(body.limit));
};

async function run(env: Env, q: string, limit: number): Promise<Response> {
  if (q.length < MIN_QUESTION_LEN) {
    return Response.json(
      { error: "query_too_short", message: `Provide a question of at least ${MIN_QUESTION_LEN} characters.` },
      { status: 400, headers: JSON_HEADERS },
    );
  }

  try {
    const res = await env.AI_SEARCH.chatCompletions({
      messages: [{ role: "user", content: q }],
      ai_search_options: {
        retrieval: { retrieval_type: "hybrid", max_num_results: limit },
      },
    });
    const answer = res.choices?.[0]?.message?.content ?? "";
    const citations = (res.chunks ?? []).map(toCitation);
    return Response.json({ q, answer, citations }, { headers: ASK_HEADERS });
  } catch (err) {
    console.error("ai-search ask error", err);
    return Response.json(
      { error: "ai_search_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 502, headers: JSON_HEADERS },
    );
  }
}
