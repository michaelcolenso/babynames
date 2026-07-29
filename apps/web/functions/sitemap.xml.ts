// GET /sitemap.xml — sitemap index over the three child sitemaps.
//
// This used to be a single urlset in which hubs, years, letters, blog posts and
// name pages all competed for one 50,000-URL budget: the name list was
// explicitly truncated by whatever the other classes consumed. Splitting it
// removes that coupling permanently and gives each class its own file.
//
// The URL stays /sitemap.xml, so the reference in robots.txt and anything
// already registered in Search Console keeps working.

import {
  absoluteUrl,
  getMeta,
  META_KEYS,
  renderSitemapIndex,
  withoutBody,
  xmlResponse,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const CHILDREN = ["/sitemap-core.xml", "/sitemap-names.xml", "/sitemap-collections.xml"];

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const [dataVersion, yMStr] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  const lastmod = `${Number(yMStr ?? 2024)}-05-15`;
  const xml = renderSitemapIndex(
    CHILDREN.map((path) => ({ loc: absoluteUrl(url.origin, path), lastmod })),
  );

  return xmlResponse(xml, dataVersion ? `sitemap-${dataVersion}` : null);
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => withoutBody(await onRequestGet(ctx));
