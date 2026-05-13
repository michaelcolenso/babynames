// GET /year/:year/ — HTML page showing top baby names for a specific year.

import { getMeta, topBySpecificYear, META_KEYS } from "@nv/shared";
import { renderYearPage } from "@nv/shared";
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
    topBySpecificYear(ctx.env.DB, year, 25),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  if (year > yM || year < ym) {
    return new Response(
      `<!doctype html><html><body><h1>No data</h1><p>No data for ${year}. Available: ${ym}–${yM}.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!rows.length) {
    return new Response(
      `<!doctype html><html><body><h1>No data</h1><p>No data found for ${year}.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const url = new URL(ctx.request.url);
  const canonical = `${url.origin}/year/${year}/`;

  const html = renderYearPage(year, rows, {
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
