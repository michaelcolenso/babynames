// Shared helpers for the sitemap index and its three children. Extracted so the
// four functions do not carry four copies of the same escaping.

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  priority?: number;
}

/** Per-file cap from the sitemaps.org spec. */
export const MAX_SITEMAP_URLS = 50_000;

/**
 * A `lastmod` date from a timestamp, or null when the value is not parseable.
 * `meta.facts_build` is an ISO timestamp; `data_version` is a UUID and yields
 * null, which is the point — only real timestamps become dates.
 */
export function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** The newest of several YYYY-MM-DD dates, ignoring nulls. */
export function newestDate(...dates: (string | null | undefined)[]): string | undefined {
  const known = dates.filter((d): d is string => Boolean(d));
  return known.length ? known.reduce((a, b) => (a > b ? a : b)) : undefined;
}

export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** ETag values must be a narrow ASCII set; data_version is a UUID but the
 *  helper also guards against anything else finding its way into a header. */
export function headerSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "-");
}

export function toXmlEntry(u: SitemapUrl): string {
  let s = `  <url><loc>${xmlEscape(u.loc)}</loc>`;
  if (u.lastmod) s += `<lastmod>${xmlEscape(u.lastmod)}</lastmod>`;
  if (u.priority !== undefined) s += `<priority>${u.priority.toFixed(1)}</priority>`;
  s += "</url>";
  return s;
}

export function renderUrlset(urls: readonly SitemapUrl[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.slice(0, MAX_SITEMAP_URLS).map(toXmlEntry),
    "</urlset>",
    "",
  ].join("\n");
}

export function renderSitemapIndex(entries: readonly { loc: string; lastmod?: string }[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((e) => {
      const lastmod = e.lastmod ? `<lastmod>${xmlEscape(e.lastmod)}</lastmod>` : "";
      return `  <sitemap><loc>${xmlEscape(e.loc)}</loc>${lastmod}</sitemap>`;
    }),
    "</sitemapindex>",
    "",
  ].join("\n");
}

export function xmlResponse(body: string, etag: string | null): Response {
  return new Response(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
      ...(etag ? { ETag: `"${headerSafe(etag)}"` } : {}),
    },
  });
}

export function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
