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
  // ── Newsletter ─────────────────────────────────────────────────────────
  //
  // HMAC key for confirmation and unsubscribe links. Set as a Pages *secret*
  // (`wrangler pages secret put NEWSLETTER_TOKEN_SECRET`). Rotating it
  // invalidates every outstanding link, including unsubscribe links already
  // sitting in subscribers' inboxes — rotate only if the key leaks.
  NEWSLETTER_TOKEN_SECRET?: string;
  // Resend API key. When this and NEWSLETTER_FROM are both set, signup uses
  // double opt-in; with either missing it falls back to single opt-in.
  NEWSLETTER_API_KEY?: string;
  // Verified sender, e.g. "NobodyNamed <hello@nobodynamed.com>".
  NEWSLETTER_FROM?: string;
  NEWSLETTER_REPLY_TO?: string;
  // ── x402 payments ──────────────────────────────────────────────────────
  //
  // Wallet address that receives x402 payments on Base Sepolia (USDC).
  // Set as a Pages environment variable/secret — never hardcoded. Until
  // it's set, GET /api/premium/report/:name returns 501 instead of
  // advertising a payment path with nowhere real to send funds.
  X402_PAY_TO?: string;
  // Facilitator base URL for /verify and /settle. Defaults to the free
  // public testnet facilitator (https://x402.org/facilitator) when unset.
  X402_FACILITATOR_URL?: string;
}
