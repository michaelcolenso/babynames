// GET /era/:year/ — editorial birth-year page wrapper.

import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<unknown, "year"> = async (ctx) => {
  const raw = ctx.params.year;
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) {
    return new Response("bad year", { status: 400 });
  }

  const year = Number(raw);
  const title = `${year} names — generational roster | NobodyNamed`;
  const desc = `Explore the names that defined ${year}: classroom names, cohort signals, and generational naming patterns from SSA records.`;
  const url = new URL(ctx.request.url);
  const canonicalYear = `${url.origin}/year/${year}/`;

  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonicalYear}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonicalYear}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="/assets/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/assets/style.css"></noscript>
<script type="application/ld+json">[{"@context":"https://schema.org","@type":"WebPage","name":"${title}","url":"${canonicalYear}","description":"${desc}","isPartOf":{"@type":"WebSite","name":"NobodyNamed","url":"${url.origin}/"}}]</script>
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
      <a href="/about">About</a>
    </nav>
  </header>
  <main>
    <p class="eyebrow">Era dossier</p>
    <h1>${year}</h1>
    <p class="lede">A classroom simulation for ${year}: the names most likely to appear on attendance sheets, then later in yearbooks, resumes, and memory.</p>
    <div id="year-result"><p>Loading...</p></div>
  </main>
  <footer class="site">
    <div>Based on SSA records 1880-present.</div>
    <div><a href="/about">Methodology</a></div>
  </footer>
</div>
<script src="/assets/app.js"></script>
<script src="/assets/landing.js"></script>
<script>
  (async function () {
    var target = document.getElementById("year-result");
    try {
      var r = await fetch("/api/year/${year}");
      if (!r.ok) {
        var j = await r.json();
        var msg = document.createElement("p");
        msg.className = "lede";
        msg.textContent = j.error || "No data.";
        target.replaceChildren(msg);
        return;
      }
      var data = await r.json();
      renderYearTable(${year}, data.rows, target);
    } catch (e) {
      var errMsg = document.createElement("p");
      errMsg.textContent = "Failed to load data. Try again.";
      target.replaceChildren(errMsg);
    }
  })();
</script>
</body>
</html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      Link: `<${canonicalYear}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<unknown, "year"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
