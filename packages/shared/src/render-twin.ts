// HTML renderer for /name/:name/twin/ — similar-name discovery page.

export interface TwinResult {
  name: string;
  sex: string;
  similarity: number;
}

export function renderTwinPage(
  targetName: string,
  targetSex: string,
  twins: TwinResult[],
  opts: { canonical: string; origin?: string },
): string {
  const sexLabel = targetSex === "M" ? "Masculine" : "Feminine";
  const title = `Names like ${targetName} — similar baby names | NobodyNamed`;
  const desc = `Baby names with the most similar popularity trajectory to ${targetName}. Cosine-similarity ranking from SSA data.`;
  const origin = opts.origin || new URL(opts.canonical).origin;
  const ogImageUrl = `${origin}/api/og/${encodeURIComponent(targetName)}`;
  const nameUrl = `${origin}/name/${encodeURIComponent(targetName)}/`;

  const structuredData = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        { "@type": "ListItem", position: 2, name: `${targetName} dossier`, item: nameUrl },
        { "@type": "ListItem", position: 3, name: "Similar names", item: opts.canonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url: opts.canonical,
      description: desc,
      isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: origin + "/" },
    },
  ]).replace(/</g, "\\u003c");

  const twinCards = twins
    .map((t) => {
      return `<a class="diagnosis-card" href="/name/${encodeURIComponent(t.name)}/">
  <span class="card-name">${escapeHtml(t.name)}</span>
  <span class="card-status">${t.sex === "M" ? "Masculine" : "Feminine"} · similarity ${t.similarity}</span>
</a>`;
    })
    .join("");

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
<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="/assets/style.css">
<script type="application/ld+json">${structuredData}</script>
</head>
<body>
<div class="page">
  <header class="site">
    <a class="brand" href="/">nobodynamed</a>
    <nav>
      <a href="/extinct">Extinct</a>
      <a href="/endangered">Endangered</a>
      <a href="/comeback">Comebacks</a>
      <a href="/year">Birth year</a>
      <a href="/rising">Rising</a>
      <a href="/viz">Visualizations</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <main>
    <p class="eyebrow">Trajectory match</p>
    <h1>Names like ${escapeHtml(targetName)}</h1>
    <p class="lede">The baby names whose popularity curves most closely resemble ${escapeHtml(targetName)}. Ranked by cosine similarity of their 60-year normalized sparklines.</p>
    <nav class="report-links" aria-label="Back to dossier">
      <a href="${escapeHtml(nameUrl)}">← ${escapeHtml(targetName)} dossier</a>
    </nav>
    <div class="diagnosis-grid">${twinCards}</div>
  </main>
  <footer class="site">
    <div>Built on public-domain data from the Social Security Administration.</div>
    <div><a href="/about">Methodology</a></div>
  </footer>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
