// GET /sitemap-core.xml — hubs, year/decade/letter indexes, and blog posts.
//
// Split out of /sitemap.xml, which is now a sitemap index. Before the split all
// URL classes competed for one 50,000-slot budget, so adding collection pages
// would have silently evicted name pages.
//
// The URL list comes from buildIndexableRoutes — the shared registry that also
// feeds IndexNow and the link audit — with the name family excluded, since
// those live in /sitemap-names.xml. Keeping a second hand-written copy of the
// static paths here is exactly how the two would drift.

import {
  absoluteIndexableUrl,
  buildIndexableRoutes,
  getContentVersion,
  getMeta,
  listBlogPosts,
  META_KEYS,
  renderUrlset,
  withoutBody,
  xmlResponse,
  type SitemapUrl,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const [blogPosts, contentVersion, ymStr, yMStr] = await Promise.all([
    listBlogPosts(ctx.env.DB, "published", 100, 0),
    getContentVersion(ctx.env.DB, "core").catch(() => null),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  const minYear = Number(ymStr ?? 1880);
  const maxYear = Number(yMStr ?? 2024);

  const urls: SitemapUrl[] = [
    // The collections hub is not in the shared registry: its children are
    // data-dependent and live in /sitemap-collections.xml, which applies the
    // publish floor. The hub itself is always there.
    { loc: absoluteIndexableUrl(url.origin, "/collections/"), priority: 0.7 },
    ...buildIndexableRoutes({ minYear, maxYear, blogPosts })
      .filter((route) => route.family !== "name")
      .map((route) => ({
        loc: absoluteIndexableUrl(url.origin, route.path),
        lastmod: route.lastmod,
        priority: route.priority,
      })),
  ];

  // The blog half of the content version is what makes this correct: a publish
  // through scripts/blog-publish.ts touches only blog_posts, so keying on
  // data_version alone left a new post out of this sitemap for the full
  // week-long TTL.
  return xmlResponse(renderUrlset(urls), contentVersion ? `sitemap-core-${contentVersion}` : null);
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => withoutBody(await onRequestGet(ctx));
