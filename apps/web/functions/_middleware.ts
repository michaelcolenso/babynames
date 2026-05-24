// Adds a CDN cache wrapper for every Pages Function response that opted
// in via the `Cache-Control` header. Pages already proxies static assets
// through Cloudflare's edge cache, but Functions get their own pass —
// hooking caches.default here means every endpoint gets edge-caching for
// free (with the `data_version` cache-bust trick built into each handler).

import type { PagesFunction } from "@cloudflare/workers-types";

const CANONICAL_PAGES = new Set([
  "/about",
  "/classic-names",
  "/comeback",
  "/comebacks",
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
  const url = new URL(ctx.request.url);
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

  const cache = caches.default;
  const cacheKeyHeader = ctx.request.headers.get("X-Cache-Key");
  const baseKey = cacheKeyHeader ? new Request(ctx.request.url, { headers: { "X-Cache-Key": cacheKeyHeader } }) : ctx.request;
  const cached = await cache.match(baseKey);
  if (cached) return cached;

  const res = await ctx.next();
  const cc = res.headers.get("Cache-Control");
  const responseKey = res.headers.get("X-Cache-Key");
  const cacheKey = responseKey ? new Request(ctx.request.url, { headers: { "X-Cache-Key": responseKey } }) : baseKey;
  if (cc && /s-maxage=\d+/.test(cc) && res.ok) {
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return res;
};

function canonicalizePath(pathname: string): string | null {
  if (pathname === "/" || pathname === "/sitemap.xml") return null;
  if (pathname === "/viz") return "/viz/";

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

  if (/^\/names\/[A-Z]\/?$/.test(pathname)) {
    return ensureTrailingSlash(pathname.toLowerCase());
  }
  if (/^\/names\/[a-z]$/.test(pathname)) return `${pathname}/`;
  if (/^\/names\/(?:18|19|20)\d{2}s$/.test(pathname)) return `${pathname}/`;
  if (/^\/names\/ending\/[A-Z]\/?$/.test(pathname)) {
    return ensureTrailingSlash(pathname.toLowerCase());
  }
  if (/^\/names\/ending\/[a-z]$/.test(pathname)) return `${pathname}/`;

  return null;
}

function ensureTrailingSlash(pathname: string): string {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}
