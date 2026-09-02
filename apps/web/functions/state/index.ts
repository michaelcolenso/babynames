// GET /state/ — index of all 51 state hubs, with each state's latest-year
// birth totals for context. Gives crawlers one shallow hop into every
// /state/:state/ page.

import {
  listStateDataYears,
  listStateTotalsForYear,
  pageShell,
  stateToSlug,
  STATE_NAMES,
  ALL_STATES,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const origin = new URL(ctx.request.url).origin;
  const canonical = `${origin}/state/`;

  const years = await listStateDataYears(ctx.env.DB);
  const latestYear = years[years.length - 1] ?? 0;
  const totals = latestYear ? await listStateTotalsForYear(ctx.env.DB, latestYear) : [];
  const totalsByState = new Map(totals.map((t) => [t.state, t]));

  const title = `Baby Names by State — Most Popular Names in All 50 States + DC | NobodyNamed`;
  const desc = `The most popular baby names in every US state, ranked by SSA state birth records${latestYear ? ` through ${latestYear}` : ""}. Pick a state to see its top 100, its distinctively local names, and how its ranks compare to the national chart.`;

  const links = ALL_STATES.map((s) => {
    const t = totalsByState.get(s);
    const detail = t ? `<span class="count">${fmt(t.births)} births in ${t.year}</span>` : "";
    return `<li><a href="/state/${stateToSlug(s)}/">${escapeHtml(STATE_NAMES[s] ?? s)}</a>${detail}</li>`;
  }).join("\n      ");

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        { "@type": "ListItem", position: 2, name: "By state", item: canonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      url: canonical,
      description: desc,
      isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: origin + "/" },
    },
  ];

  const html = pageShell({
    title,
    description: desc,
    canonical,
    ogImage: `${origin}/api/og/default`,
    currentPath: "/state",
    body: `
  <section class="section" aria-labelledby="state-index-title">
    <p class="kicker">Geography</p>
    <h1 id="state-index-title">Names by state.</h1>
    <p class="lede">America doesn't share a single name chart — every state ranks its own. SSA state records${years.length ? ` cover ${years[0]}–${latestYear}` : ""}; pick a state to see what actually leads there.</p>
    <ul class="year-name-list">
      ${links}
    </ul>
  </section>
  `,
    structuredData,
    scripts: ["/assets/app.js", "/assets/landing.js"],
    footerVariant: "minimal",
    footerYearRange: years.length ? `${years[0]}–${latestYear}` : undefined,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US");
}
