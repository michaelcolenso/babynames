// GET /era/:year/ — redirect legacy editorial year URLs to the canonical
// /year/:year/ route to avoid duplicate indexable content.

import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<unknown, "year"> = async (ctx) => {
  const raw = ctx.params.year;
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) {
    return new Response("bad year", { status: 400 });
  }

  return redirectToCanonicalYear(ctx.request.url, raw);
};

export const onRequestHead: PagesFunction<unknown, "year"> = async (ctx) => {
  const raw = ctx.params.year;
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) {
    return new Response("bad year", { status: 400 });
  }

  return redirectToCanonicalYear(ctx.request.url, raw);
};

function redirectToCanonicalYear(requestUrl: string, year: string): Response {
  const target = new URL(`/year/${year}/`, requestUrl);
  return Response.redirect(target.toString(), 301);
}
