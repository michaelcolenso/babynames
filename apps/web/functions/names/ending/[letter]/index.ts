// GET /names/ending/:letter/ — programmatic SEO pages for baby names by final letter.

import { getMeta, topByEnding, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function parseLetter(raw: string): string | null {
  return /^[a-z]$/i.test(raw) ? raw.toUpperCase() : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US");
}

export const onRequestGet: PagesFunction<Env, "letter"> = async (ctx) => {
  const raw = ctx.params.letter;
  if (typeof raw !== "string") {
    return new Response("bad request", { status: 400 });
  }

  const ending = parseLetter(raw);
  if (!ending) {
    return new Response("ending must be a single letter", { status: 400 });
  }

  const [rows, yMStr, ymStr] = await Promise.all([
    topByEnding(ctx.env.DB, ending, 25),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);
  if (!rows.length) {
    return new Response(
      `<!doctype html><html><body><h1>No data</h1><p>No names found ending with ${escapeHtml(ending)}.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const title = `Baby Names Ending in ${ending} | NobodyNamed`;
  const desc = `Popular baby names ending in ${ending}, ranked from Social Security Administration records. Browse girls and boys names by final letter, peak year, and current usage.`;
  const url = new URL(ctx.request.url);
  const origin = url.origin;
  const canonical = `${origin}/names/ending/${ending.toLowerCase()}/`;

  const girls = rows.filter((r) => r.sex === "F").slice(0, 25);
  const boys = rows.filter((r) => r.sex === "M").slice(0, 25);
  const topGirl = girls[0];
  const topBoy = boys[0];
  const prevEnding = ending > "A" ? String.fromCharCode(ending.charCodeAt(0) - 1) : null;
  const nextEnding = ending < "Z" ? String.fromCharCode(ending.charCodeAt(0) + 1) : null;

  const endingNav = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .map((letter) =>
      letter === ending
        ? `<strong aria-current="page">${letter}</strong>`
        : `<a href="/names/ending/${letter.toLowerCase()}/">${letter}</a>`,
    )
    .join("");

  const adjacentNav = [
    prevEnding ? `<a href="/names/ending/${prevEnding.toLowerCase()}/">← ${prevEnding}</a>` : "",
    nextEnding ? `<a href="/names/ending/${nextEnding.toLowerCase()}/">${nextEnding} →</a>` : "",
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
        { "@type": "ListItem", position: 2, name: "Names by ending", item: origin + "/names/ending/a/" },
        { "@type": "ListItem", position: 3, name: `Names ending in ${ending}`, item: canonical },
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

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(`${origin}/api/og/default`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(`${origin}/api/og/default`)}">
<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<link rel="preload" href="/assets/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/assets/style.css"></noscript>
<script type="application/ld+json">${structuredData}</script>
</head>
<body>
<div class="page">
  <header class="site">
    <a class="brand" href="/" aria-label="NobodyNamed home"><img class="brand-logo" src="/assets/brand/wordmark.svg" alt="nobodynamed"></a>
    <nav>
      <a href="/extinct">Extinct</a>
      <a href="/endangered">Endangered</a>
      <a href="/comeback">Comebacks</a>
      <a href="/year">Birth year</a>
      <a href="/names/1980s/">By decade</a>
      <a href="/names/a/">By initial</a>
      <a href="/names/ending/a/">By ending</a>
      <a href="/rising">Rising</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <main>
    <p class="eyebrow">Ending dossier</p>
    <h1>Baby names ending in ${ending}</h1>
    <p class="lede">${topGirl ? escapeHtml(topGirl.name) : ""} and ${topBoy ? escapeHtml(topBoy.name) : ""} are among the most recorded names ending in ${ending}. Use this page to compare final-letter patterns across girls and boys, then open any dossier for the full popularity curve.</p>
    <nav class="decade-nav alphabet-nav" aria-label="Browse final letters">${endingNav}</nav>
    <nav class="decade-nav" aria-label="Adjacent final letters">${adjacentNav}</nav>
    <div class="year-result-grid">
      <div class="year-col">
        <h2>Girls ending in ${ending}</h2>
        <ul class="year-name-list">${nameList(girls)}</ul>
      </div>
      <div class="year-col">
        <h2>Boys ending in ${ending}</h2>
        <ul class="year-name-list">${nameList(boys)}</ul>
      </div>
    </div>
  </main>
  <footer class="site">
    <div>Based on SSA records ${ym}–${yM}.</div>
    <div><a href="/about">Methodology</a></div>
  </footer>
</div>
<script src="/assets/app.js"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env, "letter"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
