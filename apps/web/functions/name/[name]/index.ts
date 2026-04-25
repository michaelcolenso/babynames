// GET /name/:name/  → server-rendered HTML
//
// Replaces the 2 000+ pre-generated /name/<Name>/index.html pages from the
// legacy build pipeline. Hits D1, classifies, renders, sets long edge
// cache + stale-while-revalidate. The client app.js still hydrates the
// share-card buttons by reading the JSON we embed.

import {
  classify,
  getMeta,
  getNameWithSeries,
  META_KEYS,
  renderFullPage,
  type NameRecord,
  type Sex,
} from "@nv/shared";
import type { PagesFunction, D1Database } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const raw = ctx.params.name;
  if (typeof raw !== "string" || !raw) return notFound("missing name");

  const decoded = decodeURIComponent(raw);
  const lower = decoded.toLowerCase();
  const [rows, ymStr, yMStr] = await Promise.all([
    getNameWithSeries(ctx.env.DB, lower),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  if (!rows.length) {
    return new Response(
      renderNotFoundPage(decoded),
      {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
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
  const total = (rec: NameRecord | undefined) =>
    rec ? Object.values(rec.series).reduce((a, b) => a + b, 0) : 0;
  const primary = total(m) >= total(f) ? m ?? f! : f ?? m!;
  const other = primary.sex === "M" ? f : m;

  const record: NameRecord = {
    ...primary,
    other: other ? { sex: other.sex, series: other.series } : undefined,
  };
  const cls = classify({ series: record.series, yM: record.yM })!;
  const url = new URL(ctx.request.url);
  const canonical = `${url.origin}/name/${encodeURIComponent(record.name)}/`;

  const html = renderFullPage(record, cls, { canonical });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

function notFound(msg: string): Response {
  return new Response(msg, { status: 404 });
}

function renderNotFoundPage(name: string): string {
  const safe = name.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safe} — not found | Name Vitals</title>
<link rel="stylesheet" href="/assets/style.css">
</head><body><div class="page">
<header class="site"><a class="brand" href="/">Name Vitals</a></header>
<div class="report">
  <h1>${safe}</h1>
  <p class="lede">We have no record of this name. It either was given to fewer than five babies a year across the entire SSA window, or it was never issued a Social Security number.</p>
  <p><a href="/">Try another name</a>.</p>
</div></div></body></html>`;
}
