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
  // Tier 1: Cloudflare Access. Set both to enable JWT verification via the
  // Cf-Access-Jwt-Assertion header injected by Cloudflare Access.
  CF_ACCESS_TEAM_DOMAIN?: string;  // e.g. "myteam.cloudflareaccess.com"
  CF_ACCESS_AUD?: string;          // Application Audience tag from Access policy

  // Tier 2: Shared secret (fallback / local dev). Bearer token checked against
  // this value when Access headers are absent.
  BLOG_ADMIN_SECRET?: string;
}
