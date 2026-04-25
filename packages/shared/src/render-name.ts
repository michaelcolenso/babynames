// HTML renderer for /name/:name. Used by:
//   - apps/web SSR Function (full page, edge-cached)
//   - client app.js (re-renders into #view-name on the index page, after
//     hydrating from the embedded <script type="application/json">)

import { classify, type ClassifyResult } from "./classify";
import { buildSparkline } from "./sparkline";
import type { NameRecord, Status } from "./schema";

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US");

export function renderReport(record: NameRecord): string {
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

  return `<article class="report" data-name="${escape(record.name)}" data-sex="${record.sex}">
  <h1>${escape(record.name)}</h1>
  <div class="sex">${record.sex === "M" ? "Masculine" : "Feminine"} · first seen ${a.firstYear}</div>
  <div class="status-pill status-${a.status}">${statusCopy[a.status][0]}</div>
  ${buildSparkline(record.series, record.ym, record.yM)}
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
  <div class="share-row">
    <button class="primary" data-share="card">Download share card</button>
    <button data-share="twitter">Share on Twitter</button>
    <button data-share="copy">Copy link</button>
  </div>
  <div class="affiliate">
    Curious about the history of ${escape(record.name)}? Browse
    <a rel="nofollow sponsored" target="_blank" href="https://www.amazon.com/s?k=${encodeURIComponent("history of the name " + record.name)}&amp;tag=">books about the name ${escape(record.name)} on Amazon</a>.
  </div>
</article>`;
}

export function renderFullPage(
  record: NameRecord,
  classifyResult: ClassifyResult,
  opts: { canonical: string; siteName?: string } = { canonical: "" },
): string {
  const desc = `${escape(record.name)}: peaked ${classifyResult.peakYear}, status ${classifyResult.status}.`;
  const title = `${escape(record.name)} name popularity & history | Name Vitals`;
  const dataJson = JSON.stringify({
    name: record.name,
    sex: record.sex,
    ym: record.ym,
    yM: record.yM,
    series: record.series,
    other: record.other,
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${escape(opts.canonical)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escape(opts.canonical)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/style.css">
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
  <div id="view-name">${renderReport(record)}</div>
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

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
