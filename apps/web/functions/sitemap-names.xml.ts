// GET /sitemap-names.xml — individual name pages.
//
// Now that the sitemap is an index, the whole 50,000-URL budget belongs to name
// pages instead of being shared with hubs, years, letters, and blog posts.

import {
  absoluteUrl,
  getMeta,
  listIndexableNames,
  MAX_SITEMAP_URLS,
  META_KEYS,
  renderUrlset,
  withoutBody,
  xmlResponse,
  type SitemapUrl,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const [names, dataVersion, yMStr] = await Promise.all([
    listIndexableNames(ctx.env.DB, MAX_SITEMAP_URLS),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  const dataDate = `${Number(yMStr ?? 2024)}-05-15`;
  const urls: SitemapUrl[] = names.map((name) => ({
    loc: absoluteUrl(url.origin, `/name/${encodeURIComponent(name.name)}/`),
    lastmod: dataDate,
    priority: 0.8,
  }));

  return xmlResponse(renderUrlset(urls), dataVersion ? `sitemap-names-${dataVersion}` : null);
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => withoutBody(await onRequestGet(ctx));
