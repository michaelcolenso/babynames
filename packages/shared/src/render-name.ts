// HTML renderer for /name/:name. Used by:
//   - apps/web SSR Function (full page, edge-cached)
//   - client app.js (re-renders into #view-name on the index page, after
//     hydrating from the embedded <script type="application/json">)

import { classify, type ClassifyResult } from "./classify";
import { buildSparkline } from "./sparkline";
import type { NameRecord, Status } from "./schema";

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US");

// Deterministic 5-digit report number derived from the name (djb2 mod 99999).
// Keeps the editorial "VITAL REPORT №NNNNN" caption stable across requests
// without persisting anything.
function reportNumber(name: string): string {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  const n = Math.abs(hash) % 99999;
  return String(n).padStart(5, "0");
}

export interface NarrativeContext {
  // Top-1 name per sex for the name's peak year. Powers Pattern A:
  // "When [Name] peaked in [PeakYear], the most popular girls' name was X."
  peers?: { F?: string; M?: string };
  // Total births per sex for the name's peak year and latest year. Powers
  // Pattern B: "In [PeakYear], roughly 1 in N girls born that year was named X."
  yearTotals?: { peakSexTotal?: number | null; latestSexTotal?: number | null };
}

// Pattern D: most recent year before the latest where count >= latestCount,
// excluding the immediately preceding decade. Returns null when no such year
// exists (i.e., the latest year is genuinely a multi-decade high).
function findHistoricalMatchYear(
  series: Record<number, number>,
  yM: number,
): number | null {
  const latest = series[yM] ?? 0;
  if (latest <= 0) return null;
  for (let y = yM - 11; y >= 1880; y--) {
    if ((series[y] ?? 0) >= latest) return y;
  }
  return null;
}

export function renderReport(
  record: NameRecord,
  narrative: NarrativeContext = {},
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

  // Pattern A — peer-name comparison at peak. Skipped silently when no peers
  // were supplied (e.g., the client-side hydration path).
  const patternA =
    narrative.peers && (narrative.peers.F || narrative.peers.M)
      ? `<p>When ${escape(record.name)} peaked in ${a.peakYear}, the most popular girls' name was <strong>${escape(narrative.peers.F ?? "—")}</strong> and the most popular boys' name was <strong>${escape(narrative.peers.M ?? "—")}</strong>.</p>`
      : "";

  // Pattern B — share of births (declining/endangered only).
  const peakSexTotal = narrative.yearTotals?.peakSexTotal;
  const latestSexTotal = narrative.yearTotals?.latestSexTotal;
  const showPatternB =
    (a.status === "declining" || a.status === "endangered" || a.status === "stable") &&
    typeof peakSexTotal === "number" &&
    peakSexTotal > 0 &&
    a.peakCount > 0;
  const patternB = showPatternB
    ? (() => {
        const peakRatio = Math.round((peakSexTotal as number) / a.peakCount);
        let s = `<p>In ${a.peakYear}, roughly <strong>1 in ${fmt(peakRatio)}</strong> ${sexLabel} born that year was named ${escape(record.name)}.`;
        if (typeof latestSexTotal === "number" && latestSexTotal > 0 && a.latestCount && a.latestCount > 0) {
          const latestRatio = Math.round(latestSexTotal / a.latestCount);
          s += ` In ${record.yM}, it's <strong>1 in ${fmt(latestRatio)}</strong>.`;
        }
        return s + `</p>`;
      })()
    : "";

  // Pattern D — multi-year high for rising names.
  const matchYear =
    a.status === "rising" ? findHistoricalMatchYear(record.series, record.yM) : null;
  const patternD = matchYear
    ? `<p>In ${record.yM}, more babies were named ${escape(record.name)} than in any year since ${matchYear}.</p>`
    : "";

  // Generational collision callout — shown for declining/endangered/extinct with
  // a meaningful peak (500+ babies) so the contrast is emotionally legible.
  const showCollision =
    (a.status === "declining" || a.status === "endangered" || a.status === "extinct") &&
    a.peakCount >= 500;
  const collisionBox = showCollision
    ? `<div class="collision-box">
    <div class="collision-row"><span class="collision-year">${a.peakYear}</span><strong>${fmt(a.peakCount)}</strong> ${sexLabel} named ${escape(record.name)}</div>
    <div class="collision-row collision-now"><span class="collision-year">${record.yM}</span><strong>${a.latestCount === 0 ? "0 (extinct)" : fmt(a.latestCount)}</strong> ${sexLabel} named ${escape(record.name)}</div>
  </div>`
    : "";

  return `<article class="report" data-name="${escape(record.name)}" data-sex="${record.sex}">
  <div class="report-meta">VITAL REPORT №${reportNumber(record.name)} · ${record.sex}</div>
  <h1>${escape(record.name)}</h1>
  <div class="sex">${record.sex === "M" ? "Masculine" : "Feminine"} · first seen ${a.firstYear}</div>
  <div class="status-pill status-${a.status}">${statusCopy[a.status][0]}</div>
  ${buildSparkline(record.series, record.ym, record.yM, { status: a.status })}
  ${collisionBox}
  <div class="narrative">
    <p>${statusCopy[a.status][1]}</p>
    <p>${peakSentence}</p>
    ${patternA}
    ${patternB}
    ${patternD}
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
    <button data-share="twin">Find my name's twin →</button>
  </div>
  <div id="twin-result"></div>
  <div class="affiliate">
    Further reading: <a rel="nofollow sponsored noopener" target="_blank" href="https://www.amazon.com/s?k=${encodeURIComponent("history of the name " + record.name)}&amp;tag=">books about the name ${escape(record.name)}</a>.
  </div>
</article>`;
}

export function renderFullPage(
  record: NameRecord,
  classifyResult: ClassifyResult,
  opts: {
    canonical: string;
    siteName?: string;
    narrative?: NarrativeContext;
  } = { canonical: "" },
): string {
  const desc = `${escape(record.name)}: peaked ${classifyResult.peakYear}, status ${classifyResult.status}.`;
  const title = `nobodynamed — ${escape(record.name)}`;
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

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${escape(opts.canonical)}">
<meta name="theme-color" content="#f7f5f2">
<meta name="theme-color" content="#15140f" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escape(opts.canonical)}">
<meta property="og:image" content="${escape(ogImageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${escape(ogImageUrl)}">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<div class="page">
  <header class="site">
    <a class="brand" href="/">nobodynamed</a>
    <nav class="nav-desktop">
      <a href="/extinct.html">Extinct</a>
      <a href="/endangered.html">Endangered</a>
      <a href="/comeback.html">Comebacks</a>
      <a href="/year.html">Birth year</a>
      <a href="/rising.html">Rising</a>
      <a href="/about.html">About</a>
    </nav>
    <details class="nav-mobile">
      <summary aria-label="Menu"><span aria-hidden="true">≡</span><span class="visually-hidden">Menu</span></summary>
      <nav>
        <a href="/extinct.html">Extinct</a>
        <a href="/endangered.html">Endangered</a>
        <a href="/comeback.html">Comebacks</a>
        <a href="/year.html">Birth year</a>
        <a href="/rising.html">Rising</a>
        <a href="/about.html">About</a>
      </nav>
    </details>
  </header>
  <div id="view-name">${renderReport(record, opts.narrative)}</div>
  <footer class="site">
    <div>
      <div>nobodynamed is a small data project. Names are forever. Mostly.</div>
      <div>Built on public-domain data from the Social Security Administration.</div>
    </div>
    <div><a href="/about.html">About</a> · <a rel="noopener" href="https://www.ssa.gov/oact/babynames/">SSA source</a></div>
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
