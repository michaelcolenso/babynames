// GET /sitemap-core.xml — hubs, year/decade/letter indexes, and blog posts.
//
// Split out of /sitemap.xml, which is now a sitemap index. Before the split all
// URL classes competed for one 50,000-slot budget, so adding collection pages
// would have silently evicted name pages.

import {
  absoluteUrl,
  getMeta,
  listBlogPosts,
  META_KEYS,
  renderUrlset,
  withoutBody,
  xmlResponse,
  type SitemapUrl,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const STATIC_PATHS: { path: string; priority: number }[] = [
  { path: "/", priority: 1.0 },
  { path: "/extinct", priority: 0.7 },
  { path: "/endangered", priority: 0.7 },
  { path: "/comeback", priority: 0.7 },
  { path: "/rising", priority: 0.7 },
  { path: "/year", priority: 0.7 },
  { path: "/about", priority: 0.6 },
  { path: "/press", priority: 0.6 },
  { path: "/blog/", priority: 0.7 },
  { path: "/viz/", priority: 0.6 },
  { path: "/viz/explore", priority: 0.5 },
  { path: "/viz/nobody-named-2025", priority: 0.5 },
  { path: "/viz/debut-of-the-year", priority: 0.5 },
  { path: "/viz/concentration", priority: 0.5 },
  { path: "/viz/constellations", priority: 0.5 },
  { path: "/viz/crossings", priority: 0.5 },
  { path: "/viz/empire", priority: 0.5 },
  { path: "/viz/fossil", priority: 0.5 },
  { path: "/viz/gallery", priority: 0.5 },
  { path: "/viz/graveyard", priority: 0.5 },
  { path: "/viz/heartbeats", priority: 0.5 },
  { path: "/viz/heatwave", priority: 0.5 },
  { path: "/viz/kehlani-effect", priority: 0.5 },
  { path: "/viz/living-treemap", priority: 0.5 },
  { path: "/viz/naming-diversity-index", priority: 0.5 },
  { path: "/viz/peak-speed", priority: 0.5 },
  { path: "/viz/suffix-waves", priority: 0.5 },
  { path: "/viz/surge", priority: 0.5 },
  { path: "/viz/survival", priority: 0.5 },
  { path: "/viz/tenure", priority: 0.5 },
  { path: "/viz/terminal-letters", priority: 0.5 },
  { path: "/viz/velocity", priority: 0.5 },
  { path: "/viz/wavefront", priority: 0.5 },
  { path: "/millennial-names", priority: 0.5 },
  { path: "/gen-z-names", priority: 0.5 },
  { path: "/classic-names", priority: 0.5 },
  { path: "/future-grandparent-names", priority: 0.5 },
];

function yearUrls(origin: string, ym: number, yM: number): SitemapUrl[] {
  const out: SitemapUrl[] = [];
  for (let y = ym; y <= yM; y++) {
    out.push({ loc: absoluteUrl(origin, `/year/${y}/`), lastmod: `${y}-05-15`, priority: 0.6 });
  }
  return out;
}

function decadeUrls(origin: string, ym: number, yM: number): SitemapUrl[] {
  const out: SitemapUrl[] = [];
  const startDecade = Math.floor(ym / 10) * 10;
  const endDecade = Math.floor(yM / 10) * 10;
  for (let d = startDecade; d <= endDecade; d += 10) {
    out.push({ loc: absoluteUrl(origin, `/names/${d}s/`), lastmod: `${Math.min(d + 9, yM)}-05-15`, priority: 0.5 });
  }
  return out;
}

function letterUrls(origin: string, yM: number, prefix: string, priority: number): SitemapUrl[] {
  return "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => ({
    loc: absoluteUrl(origin, `${prefix}${letter}/`),
    lastmod: `${yM}-05-15`,
    priority,
  }));
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const [blogPosts, dataVersion, ymStr, yMStr] = await Promise.all([
    listBlogPosts(ctx.env.DB, "published", 100, 0),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  const ym = Number(ymStr ?? 1880);
  const yM = Number(yMStr ?? 2024);

  const urls: SitemapUrl[] = [
    ...STATIC_PATHS.map((s) => ({ loc: absoluteUrl(url.origin, s.path), priority: s.priority })),
    { loc: absoluteUrl(url.origin, "/collections/"), priority: 0.7 },
    ...yearUrls(url.origin, ym, yM),
    ...decadeUrls(url.origin, ym, yM),
    ...letterUrls(url.origin, yM, "/names/", 0.4),
    ...letterUrls(url.origin, yM, "/names/ending/", 0.4),
    ...blogPosts.map((post) => ({
      loc: absoluteUrl(url.origin, `/blog/${encodeURIComponent(post.slug)}/`),
      lastmod: post.publishedAt ? post.publishedAt.slice(0, 10) : undefined,
      priority: 0.7,
    })),
  ];

  return xmlResponse(renderUrlset(urls), dataVersion ? `sitemap-core-${dataVersion}` : null);
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => withoutBody(await onRequestGet(ctx));
