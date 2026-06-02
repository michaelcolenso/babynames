// HTML renderer for /year/:year/ — top names for a specific birth year.

export interface YearNameRow {
  name: string;
  sex: string;
  count: number;
  rank: number;
}

const PUBLISHER_ORG = {
  "@type": "Organization" as const,
  name: "NobodyNamed",
  url: "https://nobodynamed.com/",
};

export function renderYearPage(
  year: number,
  rows: YearNameRow[],
  opts: { canonical: string; origin?: string; prevYear?: number | null; nextYear?: number | null },
): string {
  const title = `Top baby names in ${year} — popular boys and girls names | NobodyNamed`;
  const desc = `The most popular baby names from ${year}, ranked by Social Security Administration birth records. See what names defined the ${year} classroom.`;
  const origin = opts.origin || new URL(opts.canonical).origin;
  const ogImageUrl = `${origin}/api/og/year/${year}`;
  const dataDate = `${year}-05-15`;

  const structuredData = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        { "@type": "ListItem", position: 2, name: "By year", item: origin + "/year" },
        { "@type": "ListItem", position: 3, name: String(year), item: opts.canonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url: opts.canonical,
      description: desc,
      isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: origin + "/" },
      publisher: PUBLISHER_ORG,
      datePublished: dataDate,
      dateModified: dataDate,
      mainEntity: {
        "@type": "Dataset",
        name: `Top baby names in ${year}`,
        description: `Social Security Administration baby-name rankings for ${year}.`,
        temporalCoverage: `${year}/${year}`,
        spatialCoverage: { "@type": "Place", name: "United States" },
        creator: {
          "@type": "Organization",
          name: "Social Security Administration",
          url: "https://www.ssa.gov/oact/babynames/",
        },
        keywords: ["baby names", "popular names", String(year), "SSA", "rankings"],
        distribution: {
          "@type": "DataDownload",
          contentUrl: "https://www.ssa.gov/oact/babynames/names.zip",
          encodingFormat: "application/zip",
        },
      },
    },
  ]).replace(/</g, "\\u003c");

  const girls = rows.filter((r) => r.sex === "F").slice(0, 25);
  const boys = rows.filter((r) => r.sex === "M").slice(0, 25);

  const nameList = (list: YearNameRow[]) =>
    list
      .map(
        (r) =>
          `<li><span class="rank">#${r.rank}</span><a href="/name/${encodeURIComponent(r.name)}/">${escapeHtml(r.name)}</a><span class="count">${fmt(r.count)}</span></li>`,
      )
      .join("");

  const prevLink = opts.prevYear ? `<a href="/year/${opts.prevYear}/">← ${opts.prevYear}</a>` : "";
  const nextLink = opts.nextYear ? `<a href="/year/${opts.nextYear}/">${opts.nextYear} →</a>` : "";
  const yearNav = [prevLink, nextLink].filter(Boolean).join(" ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${escapeHtml(opts.canonical)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escapeHtml(opts.canonical)}">
<meta property="og:image" content="${escapeHtml(ogImageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
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
    <p class="eyebrow">Birth year roster</p>
    <h1>Top names in ${year}</h1>
    <p class="lede">The names most likely to appear on ${year} birth certificates, ranked by SSA records.</p>
    ${yearNav ? `<nav class="decade-nav" aria-label="Adjacent years">${yearNav}</nav>` : ""}
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
  </main>
  <footer class="site">
    <div>Based on SSA records 1880–${year}. Last updated ${dataDate}.</div>
    <div><a href="/about">Methodology</a></div>
  </footer>
</div>
<script src="/assets/app.js"></script>
<script src="/assets/landing.js"></script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US");
}
