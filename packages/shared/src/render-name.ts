// HTML renderer for /name/:name. Used by:
//   - apps/web SSR Function (full page, edge-cached)
//   - client app.js (re-renders into #view-name on the index page, after
//     hydrating from the embedded <script type="application/json">)

import { classify, type ClassifyResult } from "./classify";
import type { YearTopRow, YearTotal } from "./d1-queries";
import { buildSparkline } from "./sparkline";
import type { NameRecord, RelatedName, Status } from "./schema";

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US");

function generationForYear(year: number): string {
  if (year >= 2013) return "Gen Alpha";
  if (year >= 1997) return "Gen Z";
  if (year >= 1981) return "Millennial";
  if (year >= 1965) return "Gen X";
  if (year >= 1946) return "Boomer";
  if (year >= 1928) return "Silent Generation";
  return "Greatest Generation";
}

function describeStatus(
  record: NameRecord,
  a: ClassifyResult,
): {
  status: string;
  trajectory: string;
  vitality: string;
  summary: string;
  rarity: string;
  stability: string;
} {
  const decline = a.declinePct ?? 0;
  const name = escape(record.name);
  const peakEra = generationForYear(a.peakYear);
  const current = a.latestCount;
  const vitality =
    a.status === "extinct"
      ? "Dormant"
      : current >= 5000
        ? "Strong"
        : current >= 1000
          ? "Healthy"
          : current >= 100
            ? "Fragile"
            : current > 0
              ? "Rare"
              : "Below reporting floor";
  const rarity =
    current === 0
      ? "Statistical floor"
      : current < 50
        ? "99th percentile rare"
        : current < 250
          ? "Very uncommon"
          : current < 1000
            ? "Uncommon"
            : current < 5000
              ? "Mainstream"
              : "Mass culture";
  const stability =
    decline < 35
      ? "High cross-era durability"
      : decline < 70
        ? "Moderate cultural durability"
        : decline < 90
          ? "Era-bound, still legible"
          : "Highly era-bound";

  if (a.status === "extinct") {
    return {
      status: "Extinct",
      trajectory: "Near statistical disappearance",
      vitality,
      rarity,
      stability,
      summary: `${name} has moved from ordinary use into the archive. Its peak belongs most strongly to the ${peakEra} naming world, and its absence today gives the name the strange clarity of a cultural fossil.`,
    };
  }
  if (a.status === "endangered") {
    return {
      status: "Endangered",
      trajectory: `Down ${decline}% from peak`,
      vitality,
      rarity,
      stability,
      summary: `${name} once had enough force to mark a generation, but its current usage is a small remnant of that peak. The name still exists, yet now reads as a timestamp: personal, recognizable, and culturally receding.`,
    };
  }
  if (a.status === "rising") {
    return {
      status: a.peakYear < record.yM - 25 && decline > 45 ? "Resurgent" : "Rising",
      trajectory: "Gaining cultural share",
      vitality,
      rarity,
      stability,
      summary: `${name} is accumulating new signal in the present tense. Whether it is a revival or a fresh adoption curve, the name is moving from background noise toward cultural visibility again.`,
    };
  }
  if (a.status === "declining") {
    return {
      status: "Stable Decline",
      trajectory: `Gradual decline from ${a.peakYear}`,
      vitality,
      rarity,
      stability,
      summary: `${name} is past its period of maximum cultural dominance, but it has not disappeared. Unlike names that burn out quickly, it still carries enough usage to remain cross-generational rather than purely nostalgic.`,
    };
  }
  return {
    status: "Stable",
    trajectory: "Cross-generational persistence",
    vitality,
    rarity,
    stability,
    summary: `${name} has avoided the sharper boom-and-bust cycles of fashion naming. Its strength is not novelty but endurance: steady recognition across eras, families, and classrooms.`,
  };
}

interface RenderReportOptions {
  relatedNames?: RelatedName[];
  peerNames?: YearTopRow[];
  yearTotals?: YearTotal[];
}

export function renderReport(record: NameRecord): string {
  return renderReportWithOptions(record);
}

function renderReportWithOptions(record: NameRecord, opts: RenderReportOptions = {}): string {
  const a = classify({ series: record.series, yM: record.yM });
  if (!a) {
    return `<div class="report"><h1>${escape(record.name)}</h1><p class="lede">No data for this name.</p></div>`;
  }
  const sexLabel = record.sex === "M" ? "boys" : "girls";
  const dossier = describeStatus(record, a);

  const peakSentence = `Your name peaked in ${a.peakYear}, when <strong>${fmt(a.peakCount)}</strong> ${sexLabel} were named ${escape(record.name)}.`;
  const latestSentence = a.latestCount
    ? `In ${record.yM}, only <strong>${fmt(a.latestCount)}</strong> ${sexLabel} were given the name.`
    : `No ${sexLabel} were recorded with this name in ${record.yM} — at least not five of them (the SSA's reporting floor).`;

  const narrativeExtras = renderNarrativeInsights(record, a, opts, sexLabel);
  const declineSentence =
    a.status === "rising" || (a.declinePct ?? 0) <= 5
      ? ""
      : `<p>Down <strong>${a.declinePct ?? 0}%</strong> from its peak.</p>`;
  const totalSentence = `<p>All told, about <strong>${fmt(a.totalCount)}</strong> Americans have been named ${escape(record.name)} and recorded by the Social Security Administration since ${a.firstYear}.</p>`;
  const exploreLinks = renderExploreLinks(a);
  const relatedNames = renderRelatedNames(opts.relatedNames ?? []);

  const showCollision =
    (a.status === "declining" || a.status === "endangered" || a.status === "extinct") && a.peakCount >= 500;
  const collisionBox = showCollision
    ? `<div class="collision-box">
    <div class="collision-row"><span class="collision-year">${a.peakYear}</span><strong>${fmt(a.peakCount)}</strong> ${sexLabel} named ${escape(record.name)}</div>
    <div class="collision-row collision-now"><span class="collision-year">${record.yM}</span><strong>${a.latestCount === 0 ? "0 (extinct)" : fmt(a.latestCount)}</strong> ${sexLabel} named ${escape(record.name)}</div>
  </div>`
    : "";

  return `<article class="report" data-name="${escape(record.name)}" data-sex="${record.sex}">
  <div>
    <header class="dossier-head">
      <div class="sex">${record.sex === "M" ? "Masculine" : "Feminine"} dossier · first seen ${a.firstYear}</div>
      <h1>${escape(record.name)}</h1>
      <div class="status-stack">
        <div class="status-line">
          <span class="status-pill status-${a.status}">${dossier.status}</span>
          <span class="trajectory-label">${dossier.trajectory}</span>
        </div>
      </div>
      <div class="dossier-grid">
        <div class="dossier-metric"><div class="label">Peak era</div><div class="value">${a.peakYear}</div></div>
        <div class="dossier-metric"><div class="label">Peak rank proxy</div><div class="value">${fmt(a.peakCount)}</div></div>
        <div class="dossier-metric"><div class="label">Current vitality</div><div class="value">${dossier.vitality}</div></div>
        <div class="dossier-metric"><div class="label">Generation</div><div class="value">${generationForYear(a.peakYear)}</div></div>
      </div>
    </header>

    <section class="chart-panel" aria-label="${escape(record.name)} annual popularity chart">
      <div class="chart-caption"><span>${a.firstYear}</span><span>Peak ${a.peakYear}</span><span>${record.yM}</span></div>
      ${buildSparkline(record.series, record.ym, record.yM)}
    </section>

    <div class="stats">
      <div class="stat"><div class="label">Peak year</div><div class="value">${a.peakYear}</div></div>
      <div class="stat"><div class="label">Decline from peak</div><div class="value">${a.declinePct ?? 0}%</div></div>
      <div class="stat"><div class="label">${record.yM}</div><div class="value">${fmt(a.latestCount)}</div></div>
      <div class="stat"><div class="label">All-time</div><div class="value">${fmt(a.totalCount)}</div></div>
    </div>
    ${exploreLinks}
  </div>

  <aside class="report-sidebar">
    <div class="narrative">
      <p>${dossier.summary}</p>
      <p>${peakSentence}</p>
      <p>${latestSentence}</p>
      ${declineSentence}
      ${totalSentence}
    </div>
    <div class="insight-panel">
      <div class="insight-row"><span>Rarity score</span><strong>${dossier.rarity}</strong></div>
      <div class="insight-row"><span>Association</span><strong>${generationForYear(a.peakYear)}</strong></div>
      <div class="insight-row"><span>Stability</span><strong>${dossier.stability}</strong></div>
      <div class="insight-row"><span>Trajectory</span><strong>${dossier.trajectory}</strong></div>
    </div>
    ${collisionBox}
    ${relatedNames}
    <div class="share-row">
      <button class="primary" data-share="card">Download share card</button>
      <button data-share="twitter">Share</button>
      <button data-share="copy">Copy link</button>
      <button data-share="twin">Find similar names</button>
    </div>
    <div id="twin-result"></div>
    <div class="affiliate">
      Curious about the history of ${escape(record.name)}? Browse
      <a rel="nofollow sponsored" target="_blank" href="https://www.amazon.com/s?k=${encodeURIComponent("history of the name " + record.name)}&amp;tag=">books about the name ${escape(record.name)} on Amazon</a>.
    </div>
  </aside>
</article>`;
}

export function renderFullPage(
  record: NameRecord,
  classifyResult: ClassifyResult,
  opts: {
    canonical: string;
    siteName?: string;
    relatedNames?: RelatedName[];
    peerNames?: YearTopRow[];
    yearTotals?: YearTotal[];
  } = { canonical: "" },
): string {
  const desc = buildMetaDescription(record, classifyResult);
  const statusLabel = labelStatus(classifyResult.status);
  const title = `${record.name} name popularity (${statusLabel}, peak ${classifyResult.peakYear}) | NobodyNamed`;
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
  const structuredDataJson = JSON.stringify(
    buildStructuredData(record, classifyResult, {
      canonical: opts.canonical,
      title,
      description: desc,
      origin,
    }),
  ).replace(/</g, "\\u003c");

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
<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="/assets/style.css">
<script type="application/ld+json">${structuredDataJson}</script>
</head>
<body>
<div class="page">
  <header class="site">
<<<<<<< Updated upstream
    <a class="brand" href="/">NobodyNamed</a>
=======
    <a class="brand" href="/">nobodynamed</a>
>>>>>>> Stashed changes
    <nav>
      <a href="/extinct.html">Extinct</a>
      <a href="/endangered.html">Endangered</a>
      <a href="/comeback.html">Comebacks</a>
      <a href="/year.html">Birth year</a>
      <a href="/rising.html">Rising</a>
      <a href="/about.html">About</a>
    </nav>
    <details class="mobile-nav">
      <summary aria-label="Open navigation"><span></span><span></span><span></span></summary>
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
  <div id="view-name">${renderReportWithOptions(record, {
    relatedNames: opts.relatedNames,
    peerNames: opts.peerNames,
    yearTotals: opts.yearTotals,
  })}</div>
  <footer class="site">
    <div>
      <div>nobodynamed is a small data project about American first names.</div>
      <!-- TODO: compute footer counts from D1 once. -->
      <div class="footer-note">Built on public-domain Social Security Administration data: about 100,000 name/sex records and 2 million yearly observations.</div>
    </div>
    <div><a href="/about.html">About</a> &middot; <a href="https://www.ssa.gov/oact/babynames/">SSA source</a></div>
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

function renderNarrativeInsights(
  record: NameRecord,
  a: ClassifyResult,
  opts: RenderReportOptions,
  sexLabel: string,
): string[] {
  const peerSentence = renderPeerSentence(record, a, opts.peerNames ?? []);
  const shareSentence = renderShareSentence(record, a, opts.yearTotals ?? [], sexLabel);
  const risingHighSentence = renderRisingHighSentence(record, a, sexLabel);

  // TODO: Pattern C requires last_top_1000_year column on names + ingest recompute.
  const out: string[] = [];
  if (a.status === "rising") {
    if (risingHighSentence) out.push(`<p>${risingHighSentence}</p>`);
    if (peerSentence) out.push(`<p>${peerSentence}</p>`);
  } else if (a.status === "extinct") {
    if (peerSentence) out.push(`<p>${peerSentence}</p>`);
  } else {
    if (peerSentence) out.push(`<p>${peerSentence}</p>`);
    if (shareSentence) out.push(`<p>${shareSentence}</p>`);
  }
  return out;
}

function renderPeerSentence(record: NameRecord, a: ClassifyResult, peerNames: YearTopRow[]): string {
  const peers = peerNames
    .filter((row) => row.sex === record.sex && row.name.toLowerCase() !== record.name.toLowerCase())
    .slice(0, 4)
    .map((row) => row.name);
  if (!peers.length) return "";

  const sexTable = record.sex === "M" ? "boys" : "girls";
  return `In ${a.peakYear}, the same ${sexTable} table was led by ${escape(formatList(peers))}.`;
}

function renderShareSentence(record: NameRecord, a: ClassifyResult, yearTotals: YearTotal[], sexLabel: string): string {
  const totalByYear = new Map(yearTotals.map((row) => [row.year, row.total]));
  const peakTotal = totalByYear.get(a.peakYear);
  if (!peakTotal) return "";

  const peakShare = formatShare(a.peakCount, peakTotal);
  const latestTotal = totalByYear.get(record.yM);
  const latestShare =
    latestTotal && a.latestCount
      ? `<strong>${formatShare(a.latestCount, latestTotal)}</strong>`
      : "below the SSA reporting floor";
  return `At peak, ${escape(record.name)} accounted for <strong>${peakShare}</strong> of recorded ${sexLabel} births. In ${record.yM}, it was ${latestShare}.`;
}

function renderRisingHighSentence(record: NameRecord, a: ClassifyResult, sexLabel: string): string {
  if (a.status !== "rising" || a.latestCount <= 0) return "";
  const cutoff = record.yM - 10;
  let priorYear: number | null = null;
  let priorCount = 0;
  for (let year = cutoff; year >= record.ym; year--) {
    const count = record.series[year] ?? 0;
    if (count > a.latestCount) {
      priorYear = year;
      priorCount = count;
      break;
    }
  }
  if (!priorYear) {
    return `${escape(record.name)} is at a modern high in the latest SSA record.`;
  }
  return `${escape(record.name)} has not been this common since ${priorYear}, when ${fmt(priorCount)} ${sexLabel} received it.`;
}

function formatShare(count: number, total: number): string {
  const pct = (count / total) * 100;
  if (pct > 0 && pct < 0.01) return "less than 0.01%";
  if (pct >= 1) return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
  return `${pct.toFixed(2)}%`;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function reportNumber(name: string, sex: string): string {
  let hash = 5381;
  const raw = `${name}:${sex}`;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    hash |= 0;
  }
  return String(Math.abs(hash) % 100000).padStart(5, "0");
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
      name: "NobodyNamed",
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
