// GET /state/:state/ — HTML hub page showing top baby names within one US
// state for the latest year of SSA state-level data (1910–2024). An optional
// ?year= param serves older years (crawlable, noindexed — the latest-year
// bare URL is the canonical indexable hub).

import {
  getStateYearTotals,
  listStateDataYears,
  slugToState,
  STATE_NAMES,
  topByStateYear,
  renderStatePage,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env, "state"> = async (ctx) => {
  const raw = ctx.params.state;
  if (typeof raw !== "string") {
    return new Response("bad request", { status: 400 });
  }

  const url = new URL(ctx.request.url);

  // Single-hop canonicalization: wrong case or a missing trailing slash both
  // redirect straight to the canonical URL (no double-hop chains).
  const slug = raw.toLowerCase();
  const state = slugToState(slug);
  if (raw !== slug || !url.pathname.endsWith("/")) {
    return Response.redirect(`${url.origin}/state/${encodeURIComponent(state ? slug : raw)}/`, 301);
  }
  if (!state) {
    return new Response(
      `<!doctype html><html><body><h1>Unknown state</h1><p>No state hub for "${escapeHtml(raw)}". <a href="/state/">See all states</a>.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const years = await listStateDataYears(ctx.env.DB);
  if (!years.length) {
    return new Response(
      `<!doctype html><html><body><h1>No data</h1><p>State-level data is not available yet.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  const stateYearMin = years[0]!;
  const stateYearMax = years[years.length - 1]!;

  const yearParam = url.searchParams.get("year");
  let year = stateYearMax;
  let noindex = false;
  if (yearParam !== null) {
    const parsed = Number(yearParam);
    if (!Number.isInteger(parsed) || !years.includes(parsed)) {
      return new Response(
        `<!doctype html><html><body><h1>No data</h1><p>No state data for ${escapeHtml(yearParam)}. Available: ${stateYearMin}–${stateYearMax}.</p></body></html>`,
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }
    year = parsed;
    noindex = year !== stateYearMax;
  }

  const prevYear = years[years.indexOf(year) - 1] ?? null;

  const [rows, prevRows, totals] = await Promise.all([
    topByStateYear(ctx.env.DB, state, year),
    prevYear !== null ? topByStateYear(ctx.env.DB, state, prevYear) : Promise.resolve([]),
    getStateYearTotals(ctx.env.DB, state, year),
  ]);

  if (!rows.length) {
    return new Response(
      `<!doctype html><html><body><h1>No data</h1><p>No data found for ${escapeHtml(STATE_NAMES[state] ?? state)} in ${year}.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const canonical = `${url.origin}/state/${slug}/${noindex ? `?year=${year}` : ""}`;
  const html = renderStatePage(state, year, rows, {
    canonical,
    origin: url.origin,
    prevYear,
    prevRows,
    totals,
    stateYearMin,
    stateYearMax,
    noindex,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
    },
  });
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
