// SSR renderer for /compare/:names pages.

import { pageShell } from "./render-shell";
import type { NameRecord } from "./schema";

const COLORS = ["#d9a56f", "#6b9fb3", "#8f9e6a", "#b07aa1"];

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US");
}

function buildComparisonChart(records: NameRecord[]): string {
  if (!records.length) return "";
  const ym = records[0]!.ym;
  const yM = records[0]!.yM;
  const width = 760;
  const height = 320;
  const pad = { top: 28, right: 120, bottom: 32, left: 10 };

  const years: number[] = [];
  for (let y = ym; y <= yM; y++) years.push(y);

  let maxV = 1;
  for (const r of records) {
    for (const y of years) {
      const v = r.series[y] ?? 0;
      if (v > maxV) maxV = v;
    }
  }

  const xStep = years.length > 1 ? (width - pad.left - pad.right) / (years.length - 1) : 0;
  const yScale = (v: number) =>
    height - pad.bottom - (v / maxV) * (height - pad.top - pad.bottom);
  const xAt = (year: number) => pad.left + (year - ym) * xStep;

  let paths = "";
  let labels = "";
  records.forEach((r, i) => {
    const color = COLORS[i % COLORS.length];
    let d = "";
    for (let j = 0; j < years.length; j++) {
      const y = years[j]!;
      const x = xAt(y);
      const v = yScale(r.series[y] ?? 0);
      d += `${j === 0 ? "M" : "L"}${x.toFixed(1)},${v.toFixed(1)}`;
    }
    const lastYear = years[years.length - 1]!;
    const lastX = xAt(lastYear);
    const lastY = yScale(r.series[lastYear] ?? 0);
    paths += `<path class="compare-line" d="${d}" stroke="${color}"/>`;
    labels += `<text x="${(lastX + 8).toFixed(1)}" y="${(lastY + 4).toFixed(1)}" fill="${color}" class="compare-label">${escape(r.name)}</text>`;
  });

  let ticks = "";
  for (let y = Math.ceil(ym / 20) * 20; y <= yM; y += 20) {
    const x = xAt(y);
    ticks += `<text x="${x.toFixed(1)}" y="${height - 8}" class="compare-tick">${y}</text>`;
  }

  return `<svg class="compare-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Comparison chart">
    <line class="compare-axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"/>
    ${paths}
    ${labels}
    ${ticks}
  </svg>`;
}

function renderLegend(records: NameRecord[]): string {
  const items = records
    .map((r, i) => {
      const color = COLORS[i % COLORS.length];
      const peak = Math.max(...Object.values(r.series));
      const total = Object.values(r.series).reduce((a, b) => a + b, 0);
      return `<div class="compare-legend-item">
        <span class="compare-swatch" style="background:${color}"></span>
        <div>
          <strong>${escape(r.name)}</strong>
          <span>${r.sex === "M" ? "Masculine" : "Feminine"} · peak ${fmt(peak)} · total ${fmt(total)}</span>
        </div>
      </div>`;
    })
    .join("");
  return `<div class="compare-legend">${items}</div>`;
}

export function renderComparePage(
  records: NameRecord[],
  opts: { canonical: string; siteName?: string },
): string {
  const names = records.map((r) => r.name);
  const title = `${names.join(" vs. ")} — Name comparison | NobodyNamed`;
  const description = `Compare the popularity history of ${names.join(", ")} using SSA baby name data.`;
  const origin = opts.canonical ? new URL(opts.canonical).origin : "";
  const ogImageUrl = `${origin}/api/og/${encodeURIComponent(names[0]!)}`;
  const dataJson = JSON.stringify({ records });

  const body = `<article class="report compare-report" id="view-compare">
    <header class="dossier-head">
      <div class="sex">Comparison</div>
      <h1>${names.map((n) => escape(n)).join(' <span class="compare-vs">vs.</span> ')}</h1>
      <p class="lede">Overlaying ${records.length} names from ${records[0]!.ym} to ${records[0]!.yM}.</p>
    </header>
    <section class="chart-panel compare-panel" aria-label="Name comparison chart">
      ${buildComparisonChart(records)}
      ${renderLegend(records)}
    </section>
    <div class="share-row">
      <button data-share="copy">Copy link</button>
      <button data-share="twitter">Share</button>
    </div>
  </article>`;

  return pageShell({
    title,
    description,
    canonical: opts.canonical,
    ogImage: ogImageUrl,
    ogImageAlt: title,
    ogType: "article",
    body,
    scripts: ["/assets/app.js"],
    jsonDataBlocks: [{ id: "nv-compare-data", data: JSON.parse(dataJson) }],
    inlineScripts: [
      `(function () {
    var el = document.getElementById("nv-compare-data");
    if (!el || !window.NameVitals) return;
    var data = JSON.parse(el.textContent);
    var container = document.getElementById("view-compare");
    NameVitals.attachShareHandlers(container, { name: ${JSON.stringify(names.join(" vs. "))} });
    if (NameVitals.attachCompareTooltip) NameVitals.attachCompareTooltip(container, data.records);
  })();`,
    ],
    footerVariant: "full",
  });
}
