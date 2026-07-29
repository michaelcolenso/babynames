// Adds a CDN cache wrapper for every Pages Function response that opted
// in via the `Cache-Control` header. Pages already proxies static assets
// through Cloudflare's edge cache, but Functions get their own pass —
// hooking caches.default here means every endpoint gets edge-caching for
// free (with the `data_version` cache-bust trick built into each handler).

import type { D1Database, PagesFunction } from "@cloudflare/workers-types";

// meta.facts_version changes only when name_facts is reseeded, so one lookup
// per isolate per TTL is ample. Kept deliberately short: the window between a
// seed and the caches following it should be seconds, not minutes.
const FACTS_VERSION_TTL_MS = 30_000;
let factsVersionCache: { value: string | null; at: number } | null = null;

async function factsVersionFor(db: D1Database | undefined): Promise<string | null> {
  if (!db) return null;
  const now = Date.now();
  if (factsVersionCache && now - factsVersionCache.at < FACTS_VERSION_TTL_MS) {
    return factsVersionCache.value;
  }
  try {
    const row = await db
      .prepare("SELECT value FROM meta WHERE key = 'facts_version'")
      .first<{ value: string }>();
    factsVersionCache = { value: row?.value ?? null, at: now };
  } catch {
    // A meta lookup failure must never take the page down; fall back to an
    // unversioned key, which is exactly today's behaviour.
    factsVersionCache = { value: null, at: now };
  }
  return factsVersionCache.value;
}

const CANONICAL_PAGES = new Set([
  "/about",
  "/classic-names",
  "/comeback",
  "/endangered",
  "/extinct",
  "/future-grandparent-names",
  "/gen-z-names",
  "/millennial-names",
  "/rising",
  "/viz/explore",
  "/viz/gallery",
  "/viz/kehlani-effect",
  "/viz/nobody-named-2025",
  "/year",
]);

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const url = new URL(ctx.request.url);

  try {
    const response = await handleRequest(ctx, url);
    return withResponseHeaders(response, requestId);
  } catch (error) {
    const normalized = normalizeError(error);
    const rayId = ctx.request.headers.get("CF-Ray");

    console.error(
      JSON.stringify({
        event: "pages_function_unhandled_error",
        requestId,
        rayId,
        method: ctx.request.method,
        pathname: url.pathname,
        queryKeys: [...new Set(url.searchParams.keys())].sort(),
        userAgent: ctx.request.headers.get("User-Agent"),
        referrerOrigin: getReferrerOrigin(ctx.request.headers.get("Referer")),
        elapsedMs: Date.now() - startedAt,
        errorName: normalized.name,
        errorMessage: normalized.message,
        errorStack: normalized.stack,
      }),
    );

    return temporaryFailureResponse(ctx.request, requestId);
  }
};

async function handleRequest(ctx: Parameters<PagesFunction<Env>>[0], url: URL): Promise<Response> {
  const legacyName = url.pathname === "/" ? url.searchParams.get("name")?.trim() : "";
  if (legacyName) {
    const target = new URL(`/name/${encodeURIComponent(legacyName)}/`, url.origin);
    const sex = url.searchParams.get("sex");
    if (sex) target.searchParams.set("sex", sex);
    return Response.redirect(target.toString(), 301);
  }

  if (ctx.request.method === "GET" || ctx.request.method === "HEAD") {
    const canonicalPath = canonicalizePath(url.pathname);
    if (canonicalPath && canonicalPath !== url.pathname) {
      const target = new URL(canonicalPath, url.origin);
      target.search = url.search;
      return Response.redirect(target.toString(), 301);
    }
  }

  // Routes whose content comes from name_facts / name_collections, plus every
  // sitemap. caches.default keys on the request URL, and cache.match never
  // consults an ETag, so a response cached before a facts seed survives the
  // seed for its full TTL: an empty collections sitemap, an empty collection
  // page, or a hub advertising nothing. A version can only invalidate a cache
  // whose key it participates in, and it does not participate in this one.
  //
  // These bypass the Cache API rather than folding a version into the key,
  // which would cost a D1 read on every request to look the version up. The
  // responses still carry Cache-Control, so Cloudflare's own edge cache
  // continues to serve them; only this extra layer is skipped.
  if (
    url.pathname === "/sitemap.xml" ||
    /^\/sitemap-[a-z]+\.xml$/.test(url.pathname) ||
    url.pathname === "/collections" ||
    url.pathname.startsWith("/collections/")
  ) {
    return ctx.next();
  }

  if (ctx.request.method !== "GET") {
    return ctx.next();
  }

  const cache = caches.default;
  // The Cloudflare Cache API keys on the request URL, not on arbitrary request
  // headers. Content-negotiated routes (the homepage serves HTML to browsers
  // and Markdown to `Accept: text/markdown`) therefore collide on a single key
  // and serve whichever representation populated the cache first — the cause of
  // the homepage intermittently returning raw Markdown. Fold the negotiated
  // variant into a synthetic, internal-only cache-key URL so the two
  // representations are cached separately. `__nv_variant` never reaches a
  // client: we always return the cached/origin Response, never redirect to it.
  const wantsMarkdown = (ctx.request.headers.get("Accept") ?? "").includes("text/markdown");
  const keyUrl = new URL(ctx.request.url);
  keyUrl.searchParams.set("__nv_variant", wantsMarkdown ? "md" : "html");

  // Name pages render name_facts and name_collections, so a page cached before
  // a facts seed keeps its missing story strip for the full TTL. An ETag cannot
  // fix that — cache.match never reads one — so the facts version goes into the
  // key itself and a rebuild simply lands on a different key.
  //
  // Bypassing instead, as the collection routes do, would drop the Cache API
  // for the busiest route on the site to fix a once-a-year transition. The
  // version lookup is memoized per isolate (see factsVersionFor) so the common
  // path adds no D1 read.
  if (url.pathname.startsWith("/name/")) {
    const version = await factsVersionFor(ctx.env.DB);
    if (version) keyUrl.searchParams.set("__nv_facts", version);
  }
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await ctx.next();
  const cacheControl = response.headers.get("Cache-Control");
  if (cacheControl && /s-maxage=\d+/.test(cacheControl) && response.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}

// Baseline security and correlation headers for every Pages Function response.
// The `_headers` file only applies to static assets, so Function-rendered pages
// (homepage, /name/:name, hubs, sitemap, …) would otherwise ship without these.
// Existing header values are preserved.
function withResponseHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("Strict-Transport-Security")) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (!headers.has("X-Content-Type-Options")) headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("Referrer-Policy")) {
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  if (!headers.has("X-Request-Id")) headers.set("X-Request-Id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function temporaryFailureResponse(request: Request, requestId: string): Response {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Retry-After": "60",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Request-Id": requestId,
  });

  const acceptsJson =
    new URL(request.url).pathname.startsWith("/api/") ||
    (request.headers.get("Accept") ?? "").includes("application/json");

  if (acceptsJson) {
    headers.set("Content-Type", "application/json; charset=utf-8");
    return withResponseHeaders(
      new Response(
        JSON.stringify({
          error: "temporarily_unavailable",
          message: "This request could not be completed. Please retry shortly.",
          requestId,
        }),
        { status: 503, headers },
      ),
      requestId,
    );
  }

  headers.set("Content-Type", "text/html; charset=utf-8");
  return withResponseHeaders(
    new Response(
      `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Temporarily unavailable | NobodyNamed</title>
</head>
<body>
  <main>
    <h1>Temporarily unavailable</h1>
    <p>This page could not be loaded. Please try again shortly.</p>
    <p><small>Request ID: ${requestId}</small></p>
  </main>
</body>
</html>`,
      { status: 503, headers },
    ),
    requestId,
  );
}

function normalizeError(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error",
      stack: error.stack ?? null,
    };
  }

  return {
    name: "NonErrorThrown",
    message: safeStringify(error),
    stack: null,
  };
}

function safeStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized ?? String(value);
  } catch {
    return String(value);
  }
}

function getReferrerOrigin(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).origin;
  } catch {
    return null;
  }
}

function canonicalizePath(pathname: string): string | null {
  if (pathname === "/" || pathname === "/sitemap.xml") return null;
  if (pathname === "/viz") return "/viz/";
  if (pathname === "/comebacks" || pathname === "/comebacks/") return "/comeback";

  const eraMatch = /^\/era\/(\d{4})\/?$/.exec(pathname);
  if (eraMatch) return `/year/${eraMatch[1]}/`;

  if (pathname.endsWith("/") && CANONICAL_PAGES.has(pathname.slice(0, -1))) {
    return pathname.slice(0, -1);
  }

  if (pathname === "/blog") return "/blog/";
  if (/^\/blog\/[^/]+$/.test(pathname)) return `${pathname}/`;

  if (/^\/year\/\d{4}$/.test(pathname)) return `${pathname}/`;

  if (/^\/name\/[^/]+$/.test(pathname)) return `${pathname}/`;
  if (/^\/name\/[^/]+\/twin$/.test(pathname)) return `${pathname}/`;

  if (/^\/shadow\/[^/]+\/\d{4}$/.test(pathname)) return `${pathname}/`;

  if (/^\/names\/[A-Z]\/?$/.test(pathname)) {
    return ensureTrailingSlash(pathname.toLowerCase());
  }
  if (/^\/names\/[a-z]$/.test(pathname)) return `${pathname}/`;
  if (/^\/names\/(?:18|19|20)\d{2}s$/.test(pathname)) return `${pathname}/`;
  if (/^\/names\/(?:18|19|20)\d{2}s\/(?:methodology|classroom|spelling-families)$/.test(pathname)) return `${pathname}/`;
  if (/^\/names\/ending\/[A-Z]\/?$/.test(pathname)) {
    return ensureTrailingSlash(pathname.toLowerCase());
  }
  if (/^\/names\/ending\/[a-z]$/.test(pathname)) return `${pathname}/`;

  return null;
}

function ensureTrailingSlash(pathname: string): string {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}
