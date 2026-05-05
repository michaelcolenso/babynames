// GET /sitemap.xml
// Curated XML sitemap for static hubs plus the strongest per-name SEO pages.

import { getMeta, listIndexableNames, META_KEYS } from "@nv/shared";
import type { PagesFunction, D1Database } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
}

const STATIC_PATHS = [
  "/",
  "/extinct.html",
  "/endangered.html",
  "/comeback.html",
  "/rising.html",
  "/year.html",
  "/about.html",
];

const MAX_SITEMAP_URLS = 50_000;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const nameLimit = MAX_SITEMAP_URLS - STATIC_PATHS.length;
  const [names, dataVersion] = await Promise.all([
    listIndexableNames(ctx.env.DB, nameLimit),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
  ]);

  const urls = [
    ...STATIC_PATHS.map((path) => absoluteUrl(url.origin, path)),
    ...names.map((name) => absoluteUrl(url.origin, `/name/${encodeURIComponent(name.name)}/`)),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((loc) => `  <url><loc>${xmlEscape(loc)}</loc></url>`),
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
