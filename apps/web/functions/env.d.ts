// Generated Env interface from wrangler types (copied without runtime types
// to avoid duplicate declarations against @cloudflare/workers-types).

declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ENRICH_WORKER: Fetcher /* name-vitals-ingest */;
    AI_SEARCH: AiSearchInstance;
  }
}

// ── Cloudflare AI Search (Workers binding) ──────────────────────────────────
//
// Minimal typings for the instance-level binding declared in wrangler.toml
// ([[ai_search]] binding = "AI_SEARCH"). Mirrors the documented method surface
// at developers.cloudflare.com/ai-search/api/search/workers-binding/. Declared
// as ambient globals so the api/ai-search functions can use them without an
// import.

interface AiSearchRetrievalOptions {
  retrieval_type?: "vector" | "keyword" | "hybrid";
  match_threshold?: number;
  max_num_results?: number;
  filters?: Record<string, unknown>;
  context_expansion?: number;
  fusion_method?: "rrf" | "max";
  keyword_match_mode?: "and" | "or";
  metadata_only?: boolean;
  return_on_failure?: boolean;
}

interface AiSearchOptions {
  retrieval?: AiSearchRetrievalOptions;
  query_rewrite?: { enabled?: boolean; model?: string; rewrite_prompt?: string };
  reranking?: { enabled?: boolean; model?: string; match_threshold?: number };
  cache?: { enabled?: boolean; cache_threshold?: string };
}

interface AiSearchMessage {
  role: string;
  content: string;
}

interface AiSearchChunk {
  id: string;
  type: string;
  score: number;
  text: string;
  item: { key: string; timestamp: number; metadata: Record<string, unknown> };
  scoring_details?: Record<string, number | string>;
}

interface AiSearchSearchResponse {
  search_query: string;
  chunks: AiSearchChunk[];
  errors?: { instance_id: string; message: string }[];
}

interface AiSearchChatResponse {
  id: string;
  model: string;
  choices: { message: { role: "assistant"; content: string }; finish_reason: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  chunks: AiSearchChunk[];
  errors?: { instance_id: string; message: string }[];
}

interface AiSearchInstance {
  search(input: {
    query?: string;
    messages?: AiSearchMessage[];
    ai_search_options?: AiSearchOptions;
  }): Promise<AiSearchSearchResponse>;
  chatCompletions(input: {
    messages: AiSearchMessage[];
    model?: string;
    stream?: false;
    ai_search_options?: AiSearchOptions;
  }): Promise<AiSearchChatResponse>;
}

interface Env extends Cloudflare.Env {
  // Optional Amazon Associates tracking ID. Set as a Pages environment variable.
  AMAZON_ASSOCIATES_TAG?: string;
  // ── Blog admin auth ────────────────────────────────────────────────────
  //
  // Shared secret for the blog admin endpoint (POST /api/blog/admin).
  // Used as a Bearer token fallback when Cloudflare Access is not in front
  // of the endpoint (e.g. local dev with wrangler dev).
  BLOG_ADMIN_SECRET?: string;
}
