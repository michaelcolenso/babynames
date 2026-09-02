// Adds a CDN cache wrapper for every Pages Function response that opted
// in via the `Cache-Control` header. Pages already proxies static assets
// through Cloudflare's edge cache, but Functions get their own pass —
// hooking caches.default here means every endpoint gets edge-caching for
// free (with the `data_version` cache-bust trick built into each handler).

import type { PagesFunction } from "@cloudflare/workers-types";
import { shouldServeMarkdown } from "./_accept";
import { getGenerationDefinition } from "@nv/shared";

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

export const onRequest: PagesFunction = async (ctx) => {
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

/**
 * Whether a path may be stored in the Worker-level variant cache.
 *
 * Entries there are keyed by a synthetic `__nv_variant` URL that Cloudflare's
 * purge API cannot address, so anything cached is effectively unevictable for
 * the lifetime of its `stale-while-revalidate` window. Agent-discovery
 * documents under `/.well-known/` change as conventions evolve and must remain
 * deletable, so they never enter it.
 */
export function usesVariantCache(pathname: string): boolean {
  return !pathname.startsWith("/.well-known/");
}

async function handleRequest(ctx: Parameters<PagesFunction>[0], url: URL): Promise<Response> {
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

  if (url.pathname === "/sitemap.xml") {
    return ctx.next();
  }

  if (ctx.request.method !== "GET") {
    return ctx.next();
  }

  // `/.well-known/oauth-protected-resource` was deleted from the repo, but the
  // apex hostname kept serving the old body — advertising an empty
  // `authorization_servers` list, which made MCP clients try to register
  // against an authorization server that does not exist and broke connector
  // setup ("Couldn't register with nobodynamed's sign-in service").
  //
  // The deployment itself is correct: both `name-vitals.pages.dev` and the
  // pinned deployment URL return 404 for this path, and a request with any
  // query string 404s too. Only the bare URL on `nobodynamed.com` served it,
  // with a steadily climbing `Age`, and it survived repeated per-file and
  // `purge_everything` purges. `.well-known` is not in `_routes.json`'s
  // `include` list, so those requests never reach Functions at all — the stale
  // copy sits in the static-asset path, where nothing in this codebase can
  // evict it.
  //
  // Adding the path to `_routes.json` routes it here instead, so this explicit
  // 404 is what answers. Keep the two together: dropping either the route
  // entry or this branch resurrects the stale document.
  if (url.pathname === "/.well-known/oauth-protected-resource") {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Agent-discovery documents skip the variant cache below. Entries there are
  // keyed by a synthetic `__nv_variant` URL that purge-by-URL cannot address,
  // so anything stored is effectively unevictable for its whole
  // stale-while-revalidate window. These files are added and removed as agent
  // conventions change and must stay evictable. (Today `_routes.json` keeps
  // most of `.well-known` out of Functions entirely, so this mainly guards
  // against a future route entry quietly making them cacheable.)
  if (!usesVariantCache(url.pathname)) {
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
  const wantsMarkdown = shouldServeMarkdown(ctx.request);
  const keyUrl = new URL(ctx.request.url);
  keyUrl.searchParams.set("__nv_variant", wantsMarkdown ? "md" : "html");
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
  if (pathname === "/names") return "/names/";
  if (pathname === "/state") return "/state/";
  if (/^\/blog\/[^/]+$/.test(pathname)) return `${pathname}/`;

  if (/^\/year\/\d{4}$/.test(pathname)) return `${pathname}/`;

  // /name/<x> and /shadow/<x>/<year> deliberately skip the trailing-slash
  // redirect here: Pages routes them to the [name] function either way, and
  // the function knows the canonical *casing* from D1. Adding the slash here
  // would force lowercase visitors through two 301s (add slash → fix case)
  // instead of one.
  if (/^\/name\/[^/]+\/twin$/.test(pathname)) return `${pathname}/`;

  if (/^\/names\/[A-Z]\/?$/.test(pathname)) {
    return ensureTrailingSlash(pathname.toLowerCase());
  }
  if (/^\/names\/[a-z]$/.test(pathname)) return `${pathname}/`;
  // Generation hubs (/names/millennials, /names/boomers) canonicalize to the
  // trailing-slash form like every other /names/ route.
  const generationSegment = /^\/names\/([a-z][a-z0-9-]*)$/.exec(pathname);
  if (generationSegment && getGenerationDefinition(generationSegment[1]!)) return `${pathname}/`;
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
