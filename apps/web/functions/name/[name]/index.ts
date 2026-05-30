// GET /name/:name/  → server-rendered HTML
//
// Replaces the 2 000+ pre-generated /name/<Name>/index.html pages from the
// legacy build pipeline. Hits D1, classifies, renders, sets long edge
// cache + stale-while-revalidate. The client app.js still hydrates the
// share-card buttons by reading the JSON we embed.

import {
  classify,
  enrichName,
  getMeta,
  getNameDiaspora,
  getNameDiscoveryClusters,
  getNameEnrichmentBundle,
  getNameWithSeries,
  getTopNamesForYear,
  getYearTotalsForYears,
  listRelatedNames,
  META_KEYS,
  renderFullPage,
  type NameRecord,
  type Sex,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const raw = ctx.params.name;
  if (typeof raw !== "string" || !raw) return notFound("missing name");

  const decoded = decodeURIComponent(raw);

  // Guard against users pasting placeholder URLs like /name/:name/.
  // Treat these as malformed templates and send them to home.
  if (/^:[a-z][a-z0-9_-]*$/i.test(decoded)) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "Cache-Control": "public, s-maxage=300",
      },
    });
  }

  const lower = decoded.toLowerCase();
  const [rows, ymStr, yMStr] = await Promise.all([
    getNameWithSeries(ctx.env.DB, lower),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  if (!rows.length) {
    return new Response(renderNotFoundPage(decoded), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  }

  // Redirect to the canonical casing if the URL doesn't match.
  const canonicalName = rows[0]!.row.name;
  if (canonicalName !== decoded) {
    const target = `/name/${encodeURIComponent(canonicalName)}/`;
    return new Response(null, {
      status: 301,
      headers: { Location: target, "Cache-Control": "public, s-maxage=86400" },
    });
  }

  const ym = Number(ymStr ?? rows[0]!.row.first_year);
  const yM = Number(yMStr ?? rows[0]!.row.last_year);

  const bySex = new Map<Sex, NameRecord>();
  for (const r of rows) {
    const series: Record<number, number> = {};
    for (const p of r.series) series[p.year] = p.count;
    bySex.set(r.row.sex, {
      name: r.row.name,
      sex: r.row.sex,
      ym,
      yM,
      series,
    });
  }
  const m = bySex.get("M");
  const f = bySex.get("F");
  const total = (rec: NameRecord | undefined) => (rec ? Object.values(rec.series).reduce((a, b) => a + b, 0) : 0);
  const primary = total(m) >= total(f) ? (m ?? f!) : (f ?? m!);
  const other = primary.sex === "M" ? f : m;

  const record: NameRecord = {
    ...primary,
    other: other ? { sex: other.sex, series: other.series } : undefined,
  };
  const cls = classify({ series: record.series, yM: record.yM })!;
  const primaryRow = rows.find((r) => r.row.sex === primary.sex) ?? rows[0]!;
  const [relatedNames, discovery, peerNames, yearTotals, enrichment, enrichmentBundle, diaspora] = await Promise.all([
    listRelatedNames(ctx.env.DB, lower, primaryRow.row.sex, primaryRow.row.status, primaryRow.row.peak_year, 6),
    getNameDiscoveryClusters(ctx.env.DB, {
      currentNameLower: lower,
      sex: primaryRow.row.sex,
      status: primaryRow.row.status,
      peakYear: primaryRow.row.peak_year,
      totalCount: primaryRow.row.total_count,
    }),
    getTopNamesForYear(ctx.env.DB, cls.peakYear, 5).catch(() => []),
    getYearTotalsForYears(ctx.env.DB, primaryRow.row.sex, [cls.peakYear, record.yM]).catch(() => []),
    enrichName(ctx.env.DB, record.name, record.sex).catch(() => null),
    getNameEnrichmentBundle(ctx.env.DB, lower, primaryRow.row.sex).catch(() => null),
    getNameDiaspora(ctx.env.DB, lower, primaryRow.row.sex).catch(() => null),
  ]);
  const url = new URL(ctx.request.url);
  const canonical = `${url.origin}/name/${encodeURIComponent(record.name)}/`;

  const html = renderFullPage(record, cls, {
    canonical,
    relatedNames,
    discovery,
    peerNames,
    yearTotals,
    enrichmentSnippet: enrichment?.snippet,
    enrichment: enrichmentBundle ?? undefined,
    diaspora: diaspora ?? undefined,
    affiliateTag: ctx.env.AMAZON_ASSOCIATES_TAG,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env, "name"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function notFound(msg: string): Response {
  return new Response(msg, { status: 404 });
}

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function renderNotFoundPage(name: string): string {
  const safe = name.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safe} — not found | NobodyNamed</title>
<link rel="stylesheet" href="/assets/style.css">
</head><body><div class="page">
<header class="site"><a class="brand" href="/" aria-label="NobodyNamed home"><img class="brand-logo" src="/assets/brand/wordmark.svg" alt="nobodynamed"></a></header>
<div class="report">
  <div class="section-label">404</div>
  <h1>${safe}</h1>
  <p class="lede">That name is not in the SSA file. It may have been given to fewer than five babies a year, recorded with another spelling, or never issued through the baby-name dataset.</p>
  <p><a href="/">Try another name</a>.</p>
</div></div></body></html>`;
}
