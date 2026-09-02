// GET /sitemap.xml
// Curated XML sitemap for static hubs plus the strongest per-name SEO pages.

import { absoluteIndexableUrl, buildIndexableRoutes, getMeta, listBlogPosts, listIndexableNames, listStateDataYears, META_KEYS } from "@nv/shared";
import type { IndexableRoute } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const MAX_SITEMAP_URLS = 50_000;
function toXmlEntry(origin: string, route: IndexableRoute): string {
  let s = `  <url><loc>${xmlEscape(absoluteIndexableUrl(origin, route.path))}</loc>`;
  if (route.lastmod) s += `<lastmod>${xmlEscape(route.lastmod)}</lastmod>`;
  if (route.priority !== undefined) s += `<priority>${route.priority.toFixed(1)}</priority>`;
  s += "</url>";
  return s;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const [names, blogPosts, dataVersion, ymStr, yMStr, stateYears] = await Promise.all([
    listIndexableNames(ctx.env.DB, MAX_SITEMAP_URLS),
    listBlogPosts(ctx.env.DB, "published", 100, 0),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
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
    ...routes.map((route) => toXmlEntry(url.origin, route)),
    "</urlset>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
      ...(dataVersion ? { ETag: `"sitemap-${headerSafe(dataVersion)}"` } : {}),
    },
  });
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
