// Adds a CDN cache wrapper for every Pages Function response that opted
// in via the `Cache-Control` header. Pages already proxies static assets
// through Cloudflare's edge cache, but Functions get their own pass —
// hooking caches.default here means every endpoint gets edge-caching for
// free (with the `data_version` cache-bust trick built into each handler).

import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequest: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url);
  const legacyName = url.pathname === "/" ? url.searchParams.get("name")?.trim() : "";
  if (legacyName) {
    const target = new URL(`/name/${encodeURIComponent(legacyName)}/`, url.origin);
    const sex = url.searchParams.get("sex");
    if (sex) target.searchParams.set("sex", sex);
    return Response.redirect(target.toString(), 301);
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
