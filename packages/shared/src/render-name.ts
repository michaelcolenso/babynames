// HTML renderer for /name/:name. Used by:
//   - apps/web SSR Function (full page, edge-cached)
//   - client app.js (re-renders into #view-name on the index page, after
//     hydrating from the embedded <script type="application/json">)

import { classify, type ClassifyResult } from "./classify";
import { buildSparkline } from "./sparkline";
import type { NameRecord, RelatedName, Status } from "./schema";

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US");

export function renderReport(record: NameRecord): string {
  return renderReportWithOptions(record);
}

function renderReportWithOptions(
  record: NameRecord,
  opts: { relatedNames?: RelatedName[] } = {},
): string {
  const a = classify({ series: record.series, yM: record.yM });
  if (!a) {
    return `<div class="report"><h1>${escape(record.name)}</h1><p class="lede">No data for this name.</p></div>`;
  }
  const sexLabel = record.sex === "M" ? "boys" : "girls";

  const statusCopy: Record<Status, [string, string]> = {
    rising: [
      "Rising",
      `More babies were named ${escape(record.name)} in the last five years than in the five before that — the name is gaining ground.`,
    ],
    stable: [
      "Stable",
      `Popularity of ${escape(record.name)} has held roughly steady over the last decade.`,
    ],
    declining: [
      "Declining",
      `${escape(record.name)} is losing ground: the last five years came in below the five before.`,
    ],
    endangered: [
      "Endangered",
      `${escape(record.name)} has fallen ${a.declinePct ?? 0}% from its peak and only ${fmt(a.latestCount)} babies received it in ${record.yM}.`,
    ],
    extinct: [
      "Extinct",
      `No babies have been named ${escape(record.name)} in ${record.yM - a.lastYear} years. It last appeared in ${a.lastYear}, when ${fmt(record.series[a.lastYear] ?? 0)} ${sexLabel} were given the name.`,
    ],
  };

  const peakSentence = `Your name peaked in ${a.peakYear}, when <strong>${fmt(a.peakCount)}</strong> ${sexLabel} were named ${escape(record.name)}.`;
  const latestSentence = a.latestCount
    ? `In ${record.yM}, only <strong>${fmt(a.latestCount)}</strong> ${sexLabel} were given the name.`
    : `No ${sexLabel} were recorded with this name in ${record.yM} — at least not five of them (the SSA's reporting floor).`;

  const declineSentence =
    a.status === "rising" || (a.declinePct ?? 0) <= 5
      ? ""
      : `<p>Down <strong>${a.declinePct ?? 0}%</strong> from its peak.</p>`;
  const totalSentence = `<p>All told, about <strong>${fmt(a.totalCount)}</strong> Americans have been named ${escape(record.name)} and recorded by the Social Security Administration since ${a.firstYear}.</p>`;
  const exploreLinks = renderExploreLinks(a);
  const relatedNames = renderRelatedNames(opts.relatedNames ?? []);

  // Generational collision callout — shown for declining/endangered/extinct with
  // a meaningful peak (500+ babies) so the contrast is emotionally legible.
  const showCollision =
    (a.status === "declining" || a.status === "endangered" || a.status === "extinct") &&
    a.peakCount >= 500;
  const collisionBox = showCollision
    ? `<div class="collision-box">
    <div class="collision-row"><span class="collision-year">In ${a.peakYear}:</span><strong>${fmt(a.peakCount)}</strong> ${sexLabel} named ${escape(record.name)}</div>
    <div class="collision-row collision-now"><span class="collision-year">In ${record.yM}:</span><strong>${a.latestCount === 0 ? "0 (extinct)" : fmt(a.latestCount)}</strong> ${sexLabel} named ${escape(record.name)}</div>
  </div>`
    : "";

  return `<article class="report" data-name="${escape(record.name)}" data-sex="${record.sex}">
  <h1>${escape(record.name)}</h1>
  <div class="sex">${record.sex === "M" ? "Masculine" : "Feminine"} · first seen ${a.firstYear}</div>
  <div class="status-pill status-${a.status}">${statusCopy[a.status][0]}</div>
  ${buildSparkline(record.series, record.ym, record.yM)}
  ${collisionBox}
  <div class="narrative">
    <p>${statusCopy[a.status][1]}</p>
    <p>${peakSentence}</p>
    <p>${latestSentence}</p>
    ${declineSentence}
    ${totalSentence}
  </div>
  <div class="stats">
    <div class="stat"><div class="label">Peak year</div><div class="value">${a.peakYear}</div></div>
    <div class="stat"><div class="label">Peak count</div><div class="value">${fmt(a.peakCount)}</div></div>
    <div class="stat"><div class="label">${record.yM}</div><div class="value">${fmt(a.latestCount)}</div></div>
    <div class="stat"><div class="label">All-time</div><div class="value">${fmt(a.totalCount)}</div></div>
  </div>
  ${exploreLinks}
  ${relatedNames}
  <div class="share-row">
    <button class="primary" data-share="card">Download share card</button>
    <button data-share="twitter">Share on Twitter</button>
    <button data-share="copy">Copy link</button>
    <button data-share="twin">Find my name's twin →</button>
  </div>
  <div id="twin-result"></div>
  <div class="affiliate">
    Curious about the history of ${escape(record.name)}? Browse
    <a rel="nofollow sponsored" target="_blank" href="https://www.amazon.com/s?k=${encodeURIComponent("history of the name " + record.name)}&amp;tag=">books about the name ${escape(record.name)} on Amazon</a>.
  </div>
</article>`;
}

export function renderFullPage(
  record: NameRecord,
  classifyResult: ClassifyResult,
  opts: { canonical: string; siteName?: string; relatedNames?: RelatedName[] } = { canonical: "" },
): string {
  const statusLabel = labelStatus(classifyResult.status);
  const desc = buildMetaDescription(record, classifyResult);
  const title = `${record.name} name popularity (${statusLabel}, peak ${classifyResult.peakYear}) | Name Vitals`;
  const dataJson = JSON.stringify({
    name: record.name,
    sex: record.sex,
    ym: record.ym,
    yM: record.yM,
    series: record.series,
    other: record.other,
  });

  const origin = opts.canonical ? new URL(opts.canonical).origin : "";
  const ogImageUrl = `${origin}/api/og/${encodeURIComponent(record.name)}`;
  const structuredDataJson = JSON.stringify(buildStructuredData(record, classifyResult, {
    canonical: opts.canonical,
    title,
    description: desc,
    origin,
  })).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(desc)}">
<link rel="canonical" href="${escape(opts.canonical)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escape(opts.canonical)}">
<meta property="og:image" content="${escape(ogImageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escape(ogImageUrl)}">
<link rel="stylesheet" href="/assets/style.css">
<script type="application/ld+json">${structuredDataJson}</script>
</head>
<body>
<div class="page">
  <header class="site">
    <a class="brand" href="/">Name Vitals</a>
    <nav>
      <a href="/extinct.html">Extinct</a>
      <a href="/endangered.html">Endangered</a>
      <a href="/rising.html">Rising</a>
      <a href="/about.html">About</a>
    </nav>
  </header>
  <div id="view-name">${renderReportWithOptions(record, { relatedNames: opts.relatedNames })}</div>
  <footer class="site">
    <div>Built on public-domain data from the Social Security Administration.</div>
    <div><a href="/about.html">About</a> · <a href="https://www.ssa.gov/oact/babynames/">SSA source</a></div>
  </footer>
</div>
<script type="application/json" id="nv-data">${dataJson.replace(/</g, "\\u003c")}</script>
<script src="/assets/app.js"></script>
<script>
  (function () {
    var el = document.getElementById("nv-data");
    if (!el || !window.NameVitals) return;
    var record = JSON.parse(el.textContent);
    NameVitals.attachShareHandlers(document.getElementById("view-name"), record);
  })();
</script>
</body>
</html>`;
}

function renderExploreLinks(a: ClassifyResult): string {
  const cohort: Partial<Record<Status, [string, string]>> = {
    extinct: ["More extinct names", "/extinct.html"],
    endangered: ["More endangered names", "/endangered.html"],
    rising: ["More rising names", "/rising.html"],
  };
  const links: string[] = [];
  const statusLink = cohort[a.status];
  if (statusLink) {
    links.push(`<a href="${statusLink[1]}">${statusLink[0]}</a>`);
  }
  links.push(`<a href="/year.html?year=${a.peakYear}">Top names from ${a.peakYear}</a>`);

  return `<nav class="report-links" aria-label="Explore more name data">${links.join("")}</nav>`;
}

function renderRelatedNames(relatedNames: RelatedName[]): string {
  if (!relatedNames.length) return "";
  const items = relatedNames
    .map((r) => {
      const sexLabel = r.sex === "M" ? "Masculine" : "Feminine";
      return `<a href="/name/${encodeURIComponent(r.name)}/">
  <strong>${escape(r.name)}</strong>
  <span>${sexLabel} · ${labelStatus(r.status)} · peak ${r.peak_year}</span>
</a>`;
    })
    .join("");
  return `<section class="related-names" aria-labelledby="related-names-title">
  <h2 id="related-names-title">Related names</h2>
  <div class="related-grid">${items}</div>
</section>`;
}

function labelStatus(status: Status): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function buildMetaDescription(record: NameRecord, a: ClassifyResult): string {
  const sexLabel = record.sex === "M" ? "boys" : "girls";
  const latest = a.latestCount
    ? `${fmt(a.latestCount)} ${sexLabel} were named ${record.name} in ${record.yM}`
    : `no ${sexLabel} were recorded with the name ${record.name} in ${record.yM}`;
  return `${record.name} peaked in ${a.peakYear} with ${fmt(a.peakCount)} ${sexLabel}; ${latest}. See SSA baby-name popularity, trend, and ${a.status} status.`;
}

function buildStructuredData(
  record: NameRecord,
  a: ClassifyResult,
  opts: { canonical: string; title: string; description: string; origin: string },
): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: opts.title,
    url: opts.canonical,
    description: opts.description,
    isPartOf: {
      "@type": "WebSite",
      name: "Name Vitals",
      url: opts.origin || opts.canonical,
    },
    mainEntity: {
      "@type": "Dataset",
      name: `SSA baby-name counts for ${record.name}`,
      description: `Annual Social Security Administration baby-name counts for ${record.name} from ${a.firstYear} through ${record.yM}.`,
      temporalCoverage: `${a.firstYear}/${record.yM}`,
      creator: {
        "@type": "Organization",
        name: "Social Security Administration",
        url: "https://www.ssa.gov/oact/babynames/",
      },
      variableMeasured: [
        { "@type": "PropertyValue", name: "Peak year", value: a.peakYear },
        { "@type": "PropertyValue", name: "Peak count", value: a.peakCount },
        { "@type": "PropertyValue", name: "Latest count", value: a.latestCount },
        { "@type": "PropertyValue", name: "Vital status", value: a.status },
      ],
    },
  };
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
