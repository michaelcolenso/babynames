// GET /sitemap.xml
// Curated XML sitemap for static hubs plus the strongest per-name SEO pages.

import { getMeta, listIndexableNames, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const STATIC_PATHS = [
  "/",
  "/extinct",
  "/endangered",
  "/comeback",
  "/rising",
  "/year",
  "/about",
];

const MAX_SITEMAP_URLS = 50_000;

function yearUrls(origin: string, ym: number, yM: number): string[] {
  const out: string[] = [];
  for (let y = ym; y <= yM; y++) out.push(absoluteUrl(origin, `/year/${y}/`));
  return out;
}

function decadeUrls(origin: string, ym: number, yM: number): string[] {
  const out: string[] = [];
  const startDecade = Math.floor(ym / 10) * 10;
  const endDecade = Math.floor(yM / 10) * 10;
  for (let d = startDecade; d <= endDecade; d += 10) {
    out.push(absoluteUrl(origin, `/names/${d}s/`));
  }
  return out;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const [names, dataVersion, ymStr, yMStr] = await Promise.all([
    listIndexableNames(ctx.env.DB, MAX_SITEMAP_URLS),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  const ym = Number(ymStr ?? 1880);
  const yM = Number(yMStr ?? 2024);
  const years = yearUrls(url.origin, ym, yM);
  const decades = decadeUrls(url.origin, ym, yM);
  const reserved = STATIC_PATHS.length + years.length + decades.length;
  const nameLimit = Math.max(0, MAX_SITEMAP_URLS - reserved);

  const urls = [
    ...STATIC_PATHS.map((path) => absoluteUrl(url.origin, path)),
    ...years,
    ...decades,
    ...names.slice(0, nameLimit).map((name) => absoluteUrl(url.origin, `/name/${encodeURIComponent(name.name)}/`)),
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
