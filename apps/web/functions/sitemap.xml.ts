// GET /sitemap.xml
// Curated XML sitemap for static hubs plus the strongest per-name SEO pages.

import { getMeta, listBlogPosts, listIndexableNames, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  priority?: number;
}

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

const MAX_SITEMAP_URLS = 50_000;

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

// 1980s decade-hub child routes (flagship). Same data vintage as the decade
// pages, so lastmod follows the dataset's max year.
function decadeHubUrls(origin: string, yM: number): SitemapUrl[] {
  return ["/names/1980s/methodology/", "/names/1980s/classroom/", "/names/1980s/spelling-families/"].map(
    (path) => ({ loc: absoluteUrl(origin, path), lastmod: `${yM}-05-15`, priority: 0.5 }),
  );
}

function initialUrls(origin: string, yM: number): SitemapUrl[] {
  return "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => ({
    loc: absoluteUrl(origin, `/names/${letter}/`),
    lastmod: `${yM}-05-15`,
    priority: 0.4,
  }));
}

function endingUrls(origin: string, yM: number): SitemapUrl[] {
  return "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => ({
    loc: absoluteUrl(origin, `/names/ending/${letter}/`),
    lastmod: `${yM}-05-15`,
    priority: 0.4,
  }));
}

function toXmlEntry(u: SitemapUrl): string {
  let s = `  <url><loc>${xmlEscape(u.loc)}</loc>`;
  if (u.lastmod) s += `<lastmod>${xmlEscape(u.lastmod)}</lastmod>`;
  if (u.priority !== undefined) s += `<priority>${u.priority.toFixed(1)}</priority>`;
  s += "</url>";
  return s;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const [names, blogPosts, dataVersion, ymStr, yMStr] = await Promise.all([
    listIndexableNames(ctx.env.DB, MAX_SITEMAP_URLS),
    listBlogPosts(ctx.env.DB, "published", 100, 0),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  const ym = Number(ymStr ?? 1880);
  const yM = Number(yMStr ?? 2024);
  const dataDate = `${yM}-05-15`;

  const staticUrls: SitemapUrl[] = STATIC_PATHS.map((s) => ({
    loc: absoluteUrl(url.origin, s.path),
    priority: s.priority,
  }));
  const years = yearUrls(url.origin, ym, yM);
  const decades = decadeUrls(url.origin, ym, yM);
  const decadeHub = decadeHubUrls(url.origin, yM);
  const initials = initialUrls(url.origin, yM);
  const endings = endingUrls(url.origin, yM);
  const blogUrls: SitemapUrl[] = blogPosts.map((post) => ({
    loc: absoluteUrl(url.origin, `/blog/${encodeURIComponent(post.slug)}/`),
    lastmod: post.publishedAt ? post.publishedAt.slice(0, 10) : undefined,
    priority: 0.7,
  }));
  const reserved = staticUrls.length + years.length + decades.length + decadeHub.length + initials.length + endings.length + blogUrls.length;
  const nameLimit = Math.max(0, MAX_SITEMAP_URLS - reserved);

  const nameUrls: SitemapUrl[] = names.slice(0, nameLimit).map((name) => ({
    loc: absoluteUrl(url.origin, `/name/${encodeURIComponent(name.name)}/`),
    lastmod: dataDate,
    priority: 0.8,
  }));

  const urls: SitemapUrl[] = [
    ...staticUrls,
    ...years,
    ...decades,
    ...decadeHub,
    ...initials,
    ...endings,
    ...blogUrls,
    ...nameUrls,
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(toXmlEntry),
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

function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
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
