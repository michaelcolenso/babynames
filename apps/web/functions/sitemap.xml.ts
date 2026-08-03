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
  contentVersionString,
  getContentVersions,
  getMeta,
  META_KEYS,
  renderSitemapIndex,
  withoutBody,
  xmlResponse,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

/** YYYY-MM-DD, or null when the input is not a parseable timestamp. */
function isoDate(value: string | null): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function newest(...dates: (string | null)[]): string | undefined {
  const known = dates.filter((d): d is string => Boolean(d));
  return known.length ? known.reduce((a, b) => (a > b ? a : b)) : undefined;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const [versions, yMStr] = await Promise.all([
    getContentVersions(ctx.env.DB).catch(() => null),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  // A crawler uses the index's lastmod to decide whether a child is worth
  // refetching. Stamping all three with the SSA release date means a facts
  // rebuild or a blog publish is invisible here, and the crawler skips the very
  // child that changed. Each child instead carries the date of the thing it is
  // actually built from.
  const ssaDate = `${Number(yMStr ?? 2024)}-05-15`;
  const factsDate = isoDate(versions?.facts ?? null);
  const blogDate = isoDate(versions?.blogUpdatedAt ?? null);

  const children: { path: string; lastmod?: string }[] = [
    // Static hubs and year/letter indexes move with the SSA release; blog posts
    // move whenever one is published or edited.
    { path: "/sitemap-core.xml", lastmod: newest(ssaDate, blogDate) },
    // The name cohort changes only on ingest.
    { path: "/sitemap-names.xml", lastmod: ssaDate },
    // Membership is whatever the last facts build produced, which can be newer
    // than the corpus it was built from.
    { path: "/sitemap-collections.xml", lastmod: newest(ssaDate, factsDate) },
  ];

  const xml = renderSitemapIndex(
    children.map((child) => ({ loc: absoluteUrl(url.origin, child.path), lastmod: child.lastmod })),
  );

  const version = versions ? contentVersionString(versions, "core") : null;
  return xmlResponse(xml, version ? `sitemap-${version}` : null);
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => withoutBody(await onRequestGet(ctx));
