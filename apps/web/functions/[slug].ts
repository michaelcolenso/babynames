// Root-level editorial route aliases required for programmatic SEO.

import type { PagesFunction } from "@cloudflare/workers-types";

const PAGES: Record<string, { title: string; eyebrow: string; lede: string; names: string[]; body: string; table?: string }> = {
  comebacks: {
    title: "Comeback Baby Names | NobodyNamed",
    eyebrow: "Recovered names",
    lede: "Names that fell out of daily use, waited in the archive, and returned as taste, nostalgia, or status.",
    names: ["Theodore", "Hazel", "Eleanor", "Violet", "Oliver", "Emma"],
    body: "Comebacks reveal that naming culture is cyclical. A name can sound exhausted to one generation and newly authoritative to the next.",
    table: "comeback",
  },
  "millennial-names": {
    title: "Millennial Baby Names | NobodyNamed",
    eyebrow: "Generation dossier",
    lede: "The classroom names of the 1980s and 1990s: high-volume, unmistakable, and now aging into cultural memory.",
    names: ["Michael", "Jessica", "Ashley", "Christopher", "Amanda", "Matthew"],
    body: "Millennial names are defined by saturation. Many were not merely popular; they were ambient facts of school rosters and suburban life.",
  },
  "gen-z-names": {
    title: "Gen Z Baby Names | NobodyNamed",
    eyebrow: "Generation dossier",
    lede: "The names that rose through the late 1990s and 2000s as naming culture became faster, more fragmented, and more image-conscious.",
    names: ["Madison", "Ethan", "Ava", "Aiden", "Isabella", "Jayden"],
    body: "Gen Z naming patterns show sharper fashion cycles, more spelling variation, and a faster path from novelty to overexposure.",
  },
  "classic-names": {
    title: "Classic Baby Names | NobodyNamed",
    eyebrow: "Durability file",
    lede: "Names that resisted the sharpest boom-and-bust cycles and remained legible across American generations.",
    names: ["James", "Elizabeth", "William", "Anna", "John", "Mary"],
    body: "Classic names derive power from repetition. They do not need a single peak moment because they carry institutional memory across eras.",
  },
  "future-grandparent-names": {
    title: "Future Grandparent Names | NobodyNamed",
    eyebrow: "Forecast by memory",
    lede: "The names that may sound young now, then ordinary, then old, then charmingly available again.",
    names: ["Harper", "Luna", "Mason", "Ava", "Liam", "Olivia"],
    body: "Every cute contemporary name is also a future old-person name. That is not an insult; it is the entire lifecycle of cultural identity.",
  },
};

export const onRequestGet: PagesFunction<Env, "slug"> = async (ctx) => {
  const slug = String(ctx.params.slug || "");

  // Pages Functions take precedence over static assets. Any slug that contains
  // a dot is a filename (e.g. extinct.html, favicon.svg) — use env.ASSETS to
  // serve it directly rather than ctx.next(), which is unreliable for static
  // asset serving from within route functions.
  if (slug.includes(".")) return ctx.env.ASSETS.fetch(ctx.request);
  // Serve static HTML pages directly — avoids redirect loops with Cloudflare Pages Pretty URLs.
  const staticPages = new Set(["extinct", "rising", "endangered", "comeback", "year", "about", "press"]);
  if (staticPages.has(slug)) {
    const assetRes = await ctx.env.ASSETS.fetch(new URL(`/${slug}.html`, ctx.request.url));
    const headers = new Headers(assetRes.headers);
    headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return new Response(assetRes.body, {
      status: assetRes.status,
      statusText: assetRes.statusText,
      headers,
    });
  }

  const page = PAGES[slug];
  if (!page) return new Response("not found", { status: 404 });

  const cards = page.names.map((name) =>
    `<a class="diagnosis-card" href="/name/${encodeURIComponent(name)}/"><span class="card-name">${name}</span><span class="card-status">Open dossier</span></a>`,
  ).join("");
  const table = page.table ? `<section class="section"><div id="t"></div></section>` : "";
  const tableScript = page.table ? `<script>renderLandingTable("${page.table}", document.getElementById("t"));</script>` : "";

  const reqUrl = new URL(ctx.request.url);
  const pageCanonical = `${reqUrl.origin}/${slug}`;
  const pageTitle = page.title.replace(" — NobodyNamed", "").replace(" | NobodyNamed", "");
  const ogImageUrl = `${reqUrl.origin}/api/og/default`;
  const structuredData = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: reqUrl.origin + "/" },
        { "@type": "ListItem", position: 2, name: pageTitle, item: pageCanonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: pageTitle,
      url: pageCanonical,
      description: page.lede,
      isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: reqUrl.origin + "/" },
    },
  ]).replace(/</g, "\\u003c");

  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${page.title}</title>
<meta name="description" content="${page.lede}">
<link rel="canonical" href="${pageCanonical}">
<meta property="og:title" content="${page.title}">
<meta property="og:description" content="${page.lede}">
<meta property="og:type" content="article">
<meta property="og:url" content="${pageCanonical}">
<meta property="og:image" content="${ogImageUrl}">
<meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ogImageUrl}">
<link rel="stylesheet" href="/assets/style.css">
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
      <a href="/rising">Rising</a>
      <a href="/viz">Visualizations</a>
      <a href="/blog/">Namecalling</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <main>
    <p class="eyebrow">${page.eyebrow}</p>
    <h1>${page.title.replace(" — NobodyNamed", "")}</h1>
    <p class="lede">${page.lede}</p>
    <p class="archive-note">${page.body}</p>
    <div class="diagnosis-grid">${cards}</div>
    ${table}
  </main>
  <footer class="site">
    <div>Built on public-domain data from the Social Security Administration.</div>
    <div><a href="/about">Methodology</a></div>
  </footer>
</div>
<script src="/assets/app.js"></script>
<script src="/assets/landing.js"></script>
${tableScript}
</body>
</html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      Link: `<${pageCanonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env, "slug"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
