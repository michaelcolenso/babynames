// GET /names/:segment/ — programmatic SEO pages for calendar decades and initials.
//
// Example: /names/1980s/ shows the most popular baby names of the 1980s.
// Example: /names/a/ shows popular baby names starting with A.
// Follows the same shell + embedded-data pattern as /era/:year/.

import { getMeta, pageShell, topByDecade, topByInitial, META_KEYS, loadDecadeHubRuntime, renderDecadeHubGeneric } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function parseDecade(raw: string): { label: string; start: number; end: number } | null {
  const m = /^((?:18|19|20)\d{2})s$/.exec(raw);
  if (!m) return null;
  const start = Number(m[1]);
  return { label: `${start}s`, start, end: start + 9 };
}

function parseInitial(raw: string): string | null {
  return /^[a-z]$/i.test(raw) ? raw.toUpperCase() : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US");
}

export const onRequestGet: PagesFunction<Env, "decade"> = async (ctx) => {
  const raw = ctx.params.decade;
  if (typeof raw !== "string") {
    return new Response("bad request", { status: 400 });
  }

  const initial = parseInitial(raw);
  if (initial) {
    return renderInitialPage(ctx, initial);
  }

  const decade = parseDecade(raw);
  if (!decade) {
    return new Response("names segment must be a letter or decade like 1980s", { status: 400 });
  }

  const runtime = await loadDecadeHubRuntime(ctx.env.DB, decade.label);
  if (runtime.status === "eligible") {
    const origin = new URL(ctx.request.url).origin;
    const canonical = `${origin}/names/${runtime.definition.slug}/`;
    return new Response(renderDecadeHubGeneric(runtime.profile, {
      origin,
      definition: runtime.definition,
      thesis: runtime.thesis,
    }), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
        Link: `<${canonical}>; rel="canonical"`,
      },
    });
  }

  const [rows, yMStr, ymStr] = await Promise.all([
    topByDecade(ctx.env.DB, decade.start, decade.end, 25),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  if (decade.start > yM || decade.end < ym) {
    return new Response(
      `<!doctype html><html><body><h1>No data</h1><p>No data for ${escapeHtml(decade.label)}. Available: ${ym}–${yM}.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!rows.length) {
    return new Response(
      `<!doctype html><html><body><h1>No data</h1><p>No data found for ${escapeHtml(decade.label)}.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const girls = rows.filter((r) => r.sex === "F").slice(0, 25);
  const boys = rows.filter((r) => r.sex === "M").slice(0, 25);
  const topGirl = girls[0];
  const topBoy = boys[0];
  const classroom = [...girls.slice(0, 2), ...boys.slice(0, 2)].map((r) => r.name);

  const title = `${decade.label} Baby Names: ${topBoy ? escapeHtml(topBoy.name) : ""} & ${topGirl ? escapeHtml(topGirl.name) : ""} Led the Decade | NobodyNamed`;
  const desc = `The most popular baby names of the ${decade.label}, ranked by SSA births. ${topGirl ? escapeHtml(topGirl.name) : ""} and ${topBoy ? escapeHtml(topBoy.name) : ""} led the decade — see the full top 25.`;
  const url = new URL(ctx.request.url);
  const origin = url.origin;
  const canonical = `${origin}/names/${decade.label}/`;

  const nameList = (list: typeof rows) =>
    list
      .map(
        (r) =>
          `<li><span class="rank">#${r.rank}</span><a href="/name/${encodeURIComponent(r.name)}/">${escapeHtml(r.name)}</a><span class="count">${fmt(r.decade_total)}</span></li>`,
      )
      .join("");

  const prevDecade = decade.start >= 1890 ? `${decade.start - 10}s` : null;
  const nextDecade = decade.end + 1 <= yM ? `${decade.start + 10}s` : null;

  const decadeNav = [
    prevDecade ? `<a href="/names/${prevDecade}/">← ${prevDecade}</a>` : "",
    nextDecade ? `<a href="/names/${nextDecade}/">${nextDecade} →</a>` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const firstAvailableYear = Math.max(decade.start, ym);
  const lastAvailableYear = Math.min(decade.end, yM);
  const yearLinks = Array.from(
    { length: lastAvailableYear - firstAvailableYear + 1 },
    (_, index) => firstAvailableYear + index,
  ).map((year) => `<a href="/year/${year}/">${year}</a>`).join(" ");

  // Build list of all decades in range for cross-linking
  const decadeStart = Math.floor(ym / 10) * 10;
  const decadeEnd = Math.floor(yM / 10) * 10;
  const allDecades: string[] = [];
  for (let d = decadeStart; d <= decadeEnd; d += 10) {
    allDecades.push(`${d}s`);
  }

  const dataJson = JSON.stringify({
    decade: decade.label,
    startYear: decade.start,
    endYear: decade.end,
    rows,
  }).replace(/</g, "\\u003c");

  const ogImageUrl = `${origin}/api/og/decade/${decade.label}`;

  const html = pageShell({
    title,
    description: desc,
    canonical,
    ogImage: ogImageUrl,
    ogType: "article",
    currentPath: `/names/${decade.label}/`,
    headerOpts: { navItems: [
      { label: "Extinct", href: "/extinct" },
      { label: "Endangered", href: "/endangered" },
      { label: "Comebacks", href: "/comeback" },
      { label: "Birth year", href: "/year" },
      { label: "By decade", href: "/names/1980s/" },
      { label: "By initial", href: "/names/a/" },
      { label: "By ending", href: "/names/ending/a/" },
      { label: "Rising", href: "/rising" },
      { label: "About", href: "/about" },
    ]},
    body: `
    <p class="eyebrow">Decade dossier</p>
    <h1>${decade.label} baby names</h1>
    <p class="lede">The names that defined the ${decade.label}: ${topBoy ? escapeHtml(topBoy.name) : ""} and ${topGirl ? escapeHtml(topGirl.name) : ""} led the decade, but the full roster tells a richer story.</p>
    <h2 class="year-story">What defined ${decade.label} baby names</h2>
    <p class="year-story">The ${decade.label} were defined by names that now read as cultural artifacts. ${escapeHtml(topBoy ? topBoy.name : "The era")} and ${escapeHtml(topGirl ? topGirl.name : "its leading names")} dominated the decade — names that crossed class lines and regional divides. Some have become vintage revival candidates; others remain frozen in time. Browse the full rankings below to see which names defined the ${decade.label} classroom.</p>
    ${prevDecade || nextDecade ? `<nav class="decade-nav" aria-label="Adjacent decades">${decadeNav}</nav>` : ""}
    <nav class="decade-nav dh-year-links" aria-label="Year-by-year pages, ${firstAvailableYear} to ${lastAvailableYear}">${yearLinks}</nav>
    <div class="year-result-grid">
      <div class="year-col">
        <h3>Girls</h3>
        <ul class="year-name-list">${nameList(girls)}</ul>
      </div>
      <div class="year-col">
        <h3>Boys</h3>
        <ul class="year-name-list">${nameList(boys)}</ul>
      </div>
    </div>
    ${allDecades.length > 1 ? `
    <h2 class="year-story">Explore more decades</h2>
    <p>Compare naming trends across all decades, from the ${allDecades[0]} to the ${allDecades[allDecades.length - 1]}.</p>
    <nav class="decade-nav" aria-label="All decades">
      ${allDecades
        .map((d) =>
          d === decade.label
            ? `<strong aria-current="page">${d}</strong>`
            : `<a href="/names/${d}/">${d}</a>`,
        )
        .join(" ")}
    </nav>
    ` : ""}
  `,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
          { "@type": "ListItem", position: 2, name: "Names by decade", item: origin + "/names/1980s/" },
          { "@type": "ListItem", position: 3, name: decade.label + " baby names", item: canonical },
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
    ],
    scripts: ["/assets/app.js", "/assets/landing.js"],
    jsonDataBlocks: [{ id: "nv-decade-data", data: JSON.parse(dataJson) }],
    inlineScripts: [
      `(function () {
    var el = document.getElementById("nv-decade-data");
    if (!el || !window.renderDecadeTable) return;
    var data = JSON.parse(el.textContent);
    renderDecadeTable(data.decade, data.rows, document.querySelector("main"));
  })();`,
    ],
    footerVariant: "minimal",
    footerYearRange: `${ym}–${yM}`,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env, "decade"> = async (ctx) => withoutBody(await onRequestGet(ctx));

async function renderInitialPage(ctx: EventContext<Env, "decade", unknown>, initial: string): Promise<Response> {
  const [rows, yMStr, ymStr] = await Promise.all([
    topByInitial(ctx.env.DB, initial, 25),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);
  if (!rows.length) {
    return new Response(
      `<!doctype html><html><body><h1>No data</h1><p>No names found for ${escapeHtml(initial)}.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const title = `Baby Names That Start With ${initial} | NobodyNamed`;
  const desc = `Popular baby names starting with ${initial}, ranked from Social Security Administration records. Browse girls and boys names, peak years, and current usage.`;
  const url = new URL(ctx.request.url);
  const origin = url.origin;
  const canonical = `${origin}/names/${initial.toLowerCase()}/`;

  const girls = rows.filter((r) => r.sex === "F").slice(0, 25);
  const boys = rows.filter((r) => r.sex === "M").slice(0, 25);
  const topGirl = girls[0];
  const topBoy = boys[0];
  const prevInitial = initial > "A" ? String.fromCharCode(initial.charCodeAt(0) - 1) : null;
  const nextInitial = initial < "Z" ? String.fromCharCode(initial.charCodeAt(0) + 1) : null;

  const alphabetNav = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .map((letter) =>
      letter === initial
        ? `<strong aria-current="page">${letter}</strong>`
        : `<a href="/names/${letter.toLowerCase()}/">${letter}</a>`,
    )
    .join("");

  const adjacentNav = [
    prevInitial ? `<a href="/names/${prevInitial.toLowerCase()}/">← ${prevInitial}</a>` : "",
    nextInitial ? `<a href="/names/${nextInitial.toLowerCase()}/">${nextInitial} →</a>` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const nameList = (list: typeof rows) =>
    list
      .map(
        (r) =>
          `<li><span class="rank">#${r.rank}</span><a href="/name/${encodeURIComponent(r.name)}/">${escapeHtml(r.name)}</a><span class="count">${fmt(r.total_count)} total · peak ${r.peak_year}</span></li>`,
      )
      .join("");

  const structuredData = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        { "@type": "ListItem", position: 2, name: "Names by initial", item: origin + "/names/a/" },
        { "@type": "ListItem", position: 3, name: `${initial} names`, item: canonical },
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
  ]).replace(/</g, "\\u003c");

  const html = pageShell({
    title,
    description: desc,
    canonical,
    ogImage: `${origin}/api/og/default`,
    ogType: "article",
    currentPath: `/names/${initial.toLowerCase()}/`,
    headerOpts: { navItems: [
      { label: "Extinct", href: "/extinct" },
      { label: "Endangered", href: "/endangered" },
      { label: "Comebacks", href: "/comeback" },
      { label: "Birth year", href: "/year" },
      { label: "By decade", href: "/names/1980s/" },
      { label: "By initial", href: "/names/a/" },
      { label: "By ending", href: "/names/ending/a/" },
      { label: "Rising", href: "/rising" },
      { label: "About", href: "/about" },
    ]},
    body: `
    <p class="eyebrow">Initial dossier</p>
    <h1>Baby names that start with ${initial}</h1>
    <p class="lede">${topGirl ? escapeHtml(topGirl.name) : ""} and ${topBoy ? escapeHtml(topBoy.name) : ""} are among the most recorded ${initial} names in SSA history. Use this page to browse names by starting letter, then open any dossier for the full popularity curve.</p>
    <nav class="decade-nav alphabet-nav" aria-label="Browse initials">${alphabetNav}</nav>
    <nav class="decade-nav" aria-label="Adjacent initials">${adjacentNav}</nav>
    <div class="year-result-grid">
      <div class="year-col">
        <h2>Girls starting with ${initial}</h2>
        <ul class="year-name-list">${nameList(girls)}</ul>
      </div>
      <div class="year-col">
        <h2>Boys starting with ${initial}</h2>
        <ul class="year-name-list">${nameList(boys)}</ul>
      </div>
    </div>
  `,
    structuredData: JSON.parse(structuredData),
    scripts: ["/assets/app.js"],
    footerVariant: "minimal",
    footerYearRange: `${ym}–${yM}`,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
}

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
