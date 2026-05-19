// Generated Env interface from wrangler types (copied without runtime types
// to avoid duplicate declarations against @cloudflare/workers-types).

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ENRICH_WORKER: Fetcher /* name-vitals-ingest */;
  }
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
