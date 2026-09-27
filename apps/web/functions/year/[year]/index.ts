// GET /year/:year/ — HTML page showing top baby names for a specific year.

import {
  getMeta,
  listNumberOneNames,
  META_KEYS,
  pageShell,
  renderYearPage,
  statusesForNames,
  topBySpecificYear,
  YEAR_PAGE_PER_SEX,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env, "year"> = async (ctx) => {
  const raw = ctx.params.year;
  if (typeof raw !== "string") {
    return new Response("bad request", { status: 400 });
  }

  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1880 || year > 2100) {
    return new Response("year must be 1880–present", { status: 400 });
  }

  const [rows, yMStr, ymStr] = await Promise.all([
    topBySpecificYear(ctx.env.DB, year, YEAR_PAGE_PER_SEX),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  if (year > yM || year < ym) {
    return notFound(`No data for ${year}. Available: ${ym}–${yM}.`);
  }

  if (!rows.length) {
    return notFound(`No data found for ${year}.`);
  }

  const url = new URL(ctx.request.url);
  const canonical = `${url.origin}/year/${year}/`;

  // Status chips and the years-at-#1 clause are enrichment: a failure in
  // either should cost the chips, not the page.
  const [statuses, numberOnes] = await Promise.all([
    statusesForNames(ctx.env.DB, rows).catch(() => undefined),
    listNumberOneNames(ctx.env.DB).catch(() => []),
  ]);

  const html = renderYearPage(year, rows, {
    statuses,
    numberOnes,
    canonical,
    origin: url.origin,
    prevYear: year > ym ? year - 1 : null,
    nextYear: year < yM ? year + 1 : null,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

function notFound(message: string): Response {
  const html = pageShell({
    title: "No data — NobodyNamed",
    description: message,
    canonical: "https://nobodynamed.com/year",
    currentPath: "/year",
    headExtras: '<meta name="robots" content="noindex">',
    body: `
  <h1>No data</h1>
  <p class="lede">${message}</p>
  <p><a href="/year">← Pick a birth year</a></p>
`,
  });
  return new Response(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}

export const onRequestHead: PagesFunction<Env, "year"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
