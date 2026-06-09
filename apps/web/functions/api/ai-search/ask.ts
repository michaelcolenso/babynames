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

// Guardrail against the RAG failure mode where, given a question the corpus
// can't answer (e.g. "most common name in Texas" — this is national SSA data
// with no state dimension), the model stitches together lexically-similar but
// irrelevant chunks and guesses. Tell it to stay grounded and refuse instead.
// Whether the instance honors an inline system message varies, so this is
// belt-and-suspenders with the `grounded` flag below (empty citations =>
// nothing actually supported the answer).
const SYSTEM_GUARDRAIL =
  "You are a baby-name assistant for Name Vitals, built on US national SSA data " +
  "(name, sex, year, count) with no state-level or geographic breakdowns. Answer " +
  "ONLY from the provided sources. If the sources do not contain the answer, say " +
  "you don't have that data — do not guess or infer. Never fabricate statistics " +
  "(rankings, totals, 'most common') that are not stated verbatim in the sources.";

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
      messages: [
        { role: "system", content: SYSTEM_GUARDRAIL },
        { role: "user", content: q },
      ],
      ai_search_options: {
        retrieval: { retrieval_type: "hybrid", max_num_results: limit },
      },
    });
    const answer = res.choices?.[0]?.message?.content ?? "";
    const citations = (res.chunks ?? []).map(toCitation);
    // No supporting chunks means nothing in the corpus actually backs this
    // answer — clients should caveat or suppress it rather than present it as
    // fact. This is the cheapest, most reliable hallucination filter.
    const grounded = citations.length > 0;
    return Response.json({ q, answer, grounded, citations }, { headers: ASK_HEADERS });
  } catch (err) {
    console.error("ai-search ask error", err);
    return Response.json(
      { error: "ai_search_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 502, headers: JSON_HEADERS },
    );
  }
}
