// GET /state/:state/ — HTML hub page showing top baby names within one US
// state for the latest year of SSA state-level data (1910–2024). An optional
// ?year= param serves older years (crawlable, noindexed — the latest-year
// bare URL is the canonical indexable hub).

import {
  getStateYearTotals,
  listStateDataYears,
  pageShell,
  slugToState,
  stateToSlug,
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

  // Single-hop canonicalization: wrong case, a postal abbreviation
  // (/state/CA/) or a missing trailing slash all redirect straight to the
  // canonical slug. Unknown slugs 404 directly — never redirect them, or an
  // uppercase miss would redirect to itself forever.
  const slug = raw.toLowerCase();
  const state = slugToState(slug) || (STATE_NAMES[raw.toUpperCase()] ? raw.toUpperCase() : "");
  if (!state) {
    return notFound(
      "Unknown state",
      `No state hub for “${escapeHtml(raw)}”. <a href="/state/">See all states</a>.`,
      `${url.origin}/state/`,
    );
  }
  const canonicalSlug = stateToSlug(state);
  if (raw !== canonicalSlug || !url.pathname.endsWith("/")) {
    return Response.redirect(`${url.origin}/state/${canonicalSlug}/${url.search}`, 301);
  }

  const years = await listStateDataYears(ctx.env.DB);
  if (!years.length) {
    return notFound("No data", "State-level data is not available yet.", `${url.origin}/state/${canonicalSlug}/`);
  }
  const stateYearMin = years[0]!;
  const stateYearMax = years[years.length - 1]!;

  const yearParam = url.searchParams.get("year");
  let year = stateYearMax;
  let noindex = false;
  if (yearParam !== null) {
    const parsed = Number(yearParam);
    if (!Number.isInteger(parsed) || !years.includes(parsed)) {
      return notFound(
        "No data",
        `No state data for ${escapeHtml(yearParam)}. Available: ${stateYearMin}–${stateYearMax}.`,
        `${url.origin}/state/${canonicalSlug}/`,
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
    return notFound(
      "No data",
      `No data found for ${escapeHtml(STATE_NAMES[state] ?? state)} in ${year}.`,
      `${url.origin}/state/${canonicalSlug}/`,
    );
  }

  const canonical = `${url.origin}/state/${canonicalSlug}/${noindex ? `?year=${year}` : ""}`;
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

// 404s go through pageShell() so they carry site chrome and nav, with
// noindex so a stray miss never competes with the real hubs.
function notFound(heading: string, messageHtml: string, canonical: string): Response {
  const html = pageShell({
    title: `${heading} — NobodyNamed`,
    description: "No state hub at this address.",
    canonical,
    currentPath: "/state/",
    headExtras: '<meta name="robots" content="noindex">',
    body: `
  <h1>${escapeHtml(heading)}</h1>
  <p class="lede">${messageHtml}</p>
  <p><a href="/state/">← All states</a></p>
`,
  });
  return new Response(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
