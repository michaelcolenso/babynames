// GET /names/ — the collection index for every /names/* hub: initial letters,
// final letters, calendar decades, and live generation hubs.
//
// Every name page's BreadcrumbList already points here ("Home › Names › …"),
// so this route must exist and 200. It also gives crawlers a single shallow
// hop into all ~26 letter pages + decade hubs, which were previously only
// reachable from individual name pages.

import {
  getMeta,
  pageShell,
  META_KEYS,
  GENERATION_DEFINITIONS,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function letterLinks(base: string): string {
  return LETTERS.map((l) => `<a href="${base}${l.toLowerCase()}/">${l}</a>`).join("\n      ");
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [ymStr, yMStr] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);
  const ym = Number(ymStr ?? 1880);
  const yM = Number(yMStr ?? 2025);

  const origin = new URL(ctx.request.url).origin;
  const canonical = `${origin}/names/`;

  const firstDecade = Math.floor(ym / 10) * 10;
  const lastDecade = Math.floor(yM / 10) * 10;
  const decades: string[] = [];
  for (let d = firstDecade; d <= lastDecade; d += 10) decades.push(`${d}s`);

  const liveGenerations = GENERATION_DEFINITIONS.filter((g) => g.rolloutState === "live");

  const title = "Browse Baby Names — by Letter, Decade & Generation | NobodyNamed";
  const desc = `Every way into the SSA baby-name archive (${ym}–${yM}): names by first letter, last letter, decade of peak popularity, and generation.`;

  const body = `
  <section class="section" aria-labelledby="names-index-title">
    <p class="kicker">The collection</p>
    <h1 id="names-index-title">Every way into the archive.</h1>
    <p class="lede">${ym}–${yM} of Social Security birth records, sliced four ways. Pick a letter, a decade, or a generation — every path ends at a name with a story in the data.</p>
  </section>

  <section class="section" aria-labelledby="by-letter">
    <p class="eyebrow">A to Z</p>
    <h2 id="by-letter">Names by first letter</h2>
    <nav class="decade-nav" aria-label="Names by first letter">
      ${letterLinks("/names/")}
    </nav>
  </section>

  <section class="section" aria-labelledby="by-ending">
    <p class="eyebrow">Endings</p>
    <h2 id="by-ending">Names by final letter</h2>
    <nav class="decade-nav" aria-label="Names by final letter">
      ${letterLinks("/names/ending/")}
    </nav>
  </section>

  <section class="section" aria-labelledby="by-decade">
    <p class="eyebrow">Timeline</p>
    <h2 id="by-decade">Names by decade</h2>
    <nav class="decade-nav" aria-label="Names by decade">
      ${decades.map((d) => `<a href="/names/${d}/">${d}</a>`).join("\n      ")}
    </nav>
  </section>

  ${
    liveGenerations.length
      ? `<section class="section" aria-labelledby="by-generation">
    <p class="eyebrow">Cohorts</p>
    <h2 id="by-generation">Names by generation</h2>
    <nav class="decade-nav" aria-label="Names by generation">
      ${liveGenerations.map((g) => `<a href="/names/${g.slug}/">${g.label}</a>`).join("\n      ")}
    </nav>
  </section>`
      : ""
  }
  `;

  const html = pageShell({
    title,
    description: desc,
    canonical,
    body,
    currentPath: "/names/",
    ogImage: `${origin}/api/og/default`,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "Names", item: canonical },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: title,
        url: canonical,
        description: desc,
        isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: `${origin}/` },
      },
    ],
    footerVariant: "full",
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => {
  const res = await onRequestGet(ctx);
  return new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers });
};
