// GET /sitemap.xml
// Curated XML sitemap for static hubs plus the strongest per-name SEO pages.

import { absoluteIndexableUrl, buildIndexableRoutes, getMeta, listBlogPosts, listIndexableNames, listStateDataYears, META_KEYS } from "@nv/shared";
import type { IndexableRoute } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const MAX_SITEMAP_URLS = 50_000;

// A sitemap must advertise exactly one canonical origin. The deployment hosts
// (`<hash>.name-vitals.pages.dev`, `name-vitals.pages.dev`) are served with
// `X-Robots-Tag: noindex`, so a request that arrives on one of them must not
// stamp every <loc> with a host we never want indexed — which is exactly what
// happened before: the whole document came out on the preview hostname.
const CANONICAL_ORIGIN = "https://nobodynamed.com";

function sitemapOrigin(url: URL): string {
  // Local development keeps its own origin so previewed links resolve.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
  return CANONICAL_ORIGIN;
}

function toXmlEntry(origin: string, route: IndexableRoute): string {
  let s = `  <url><loc>${xmlEscape(absoluteIndexableUrl(origin, route.path))}</loc>`;
  if (route.lastmod) s += `<lastmod>${xmlEscape(route.lastmod)}</lastmod>`;
  if (route.priority !== undefined) s += `<priority>${route.priority.toFixed(1)}</priority>`;
  s += "</url>";
  return s;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);

  // The middleware leaves this route alone (see `cachesOwnResponse` in
  // _middleware.ts) because the variant cache key it would use is a synthetic
  // `__nv_variant` URL that purge-by-URL cannot address. So the handler caches
  // itself, under a key carrying `data_version`, which means an SSA refresh
  // invalidates the document immediately instead of after the TTL expires.
  //
  // Without a cache this route rebuilt ~1.9 MB of XML and re-ran five D1
  // queries on every crawler hit — about a second of CPU each time.
  const dataVersion = await getMeta(ctx.env.DB, META_KEYS.dataVersion);
  const origin = sitemapOrigin(url);
  const cache = caches.default;
  // Key on the resolved origin *and* the data version: the cache API keys on
  // URL only, so an origin-agnostic key lets whichever host populates the entry
  // first decide the hostname every other host serves for a full s-maxage.
  const cacheKey = new Request(`https://internal/sitemap/${encodeURIComponent(origin)}/${dataVersion ?? "v0"}`);

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const [names, blogPosts, ymStr, yMStr, stateYears] = await Promise.all([
    listIndexableNames(ctx.env.DB, MAX_SITEMAP_URLS),
    listBlogPosts(ctx.env.DB, "published", 100, 0),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    listStateDataYears(ctx.env.DB).catch(() => [] as number[]),
  ]);

  const ym = Number(ymStr ?? 1880);
  const yM = Number(yMStr ?? 2024);
  const stateMaxYear = stateYears.length ? stateYears[stateYears.length - 1] : undefined;
  const routes = buildIndexableRoutes({ minYear: ym, maxYear: yM, stateMaxYear, names, blogPosts, maxRoutes: MAX_SITEMAP_URLS });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...routes.map((route) => toXmlEntry(origin, route)),
    "</urlset>",
    "",
  ].join("\n");

  const response = new Response(xml, {
    headers: {
      // Dataset changes are handled by the data_version cache key above, so this
      // TTL only governs how long a newly published post or content-factory page
      // waits to appear here. An hour keeps that prompt without regenerating the
      // document on every crawler hit.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
      ...(dataVersion ? { ETag: `"sitemap-${headerSafe(dataVersion)}"` } : {}),
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function headerSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "-");
}
