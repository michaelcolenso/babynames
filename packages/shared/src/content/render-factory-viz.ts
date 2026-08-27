// Content Factory — viz page renderer.
// Emits a complete static HTML page using the shared pageShell, with
// server-rendered sparkline SVGs and an embedded no-JS data table.

import { contentId, contentIdentityMeta } from "../content-identity";
import { pageShell } from "../render-shell";
import type { ContentDefinition, FactoryResult } from "./factory-types";
import { chartPanelHtml, escapeHtml } from "./factory-compute";

export interface RenderVizOpts {
  canonicalBase: string; // e.g. https://nobodynamed.com
  dataMaxYear: number;
  dataMinYear?: number;
}

export function renderFactoryVizPage(
  def: ContentDefinition,
  result: FactoryResult,
  opts: RenderVizOpts,
): string {
  const canonical = `${opts.canonicalBase}/viz/${def.slug}`;
  const identity = {
    contentId: contentId("visualization", def.slug),
    contentType: "visualization" as const,
    slug: def.slug,
    publishedAt: new Date().toISOString(),
  };

  type PanelCapable = {
    name: string;
    firstYear?: number;
    riseStartYear?: number;
    peakYear: number;
    peakCount: number;
    lastCount?: number;
    series: Record<number, number>;
  };
  const panels = (result.members as PanelCapable[])
    .map((m) =>
      chartPanelHtml({
        member: {
          name: m.name,
          firstYear: m.firstYear ?? m.riseStartYear ?? m.peakYear,
          peakYear: m.peakYear,
          peakCount: m.peakCount,
          lastCount: m.lastCount,
          series: m.series,
        },
        dataMaxYear: opts.dataMaxYear,
        dataMinYear: opts.dataMinYear,
      }),
    )
    .join("\n");

  const tableRows = result.members
    .map(
      (m) =>
        `<tr><td><a href="/name/${encodeURIComponent(m.name)}/">${escapeHtml(m.name)}</a></td><td>${escapeHtml(m.sex)}</td><td>${m.peakYear}</td><td>${m.peakCount.toLocaleString("en-US")}</td></tr>`,
    )
    .join("\n");

  const body = `<div ${contentIdentityMeta(identity)}>
<h1>${escapeHtml(def.title)}</h1>
<p class="factory-intro">${escapeHtml(def.description)}</p>
${panels}
<table class="factory-table">
<thead><tr><th>Name</th><th>Sex</th><th>Peak year</th><th>Peak births</th></tr></thead>
<tbody>
${tableRows}
</tbody>
</table>
<p class="factory-source">Source: SSA birth records (${opts.dataMinYear ?? 1880}–${opts.dataMaxYear}), ${escapeHtml(def.sourceVersion)}. ${escapeHtml(def.sourceNote ?? "Names shown peaked within two years of debut and fell below 20% of peak within five years.")}</p>
</div>`;

  return pageShell({
    title: def.title,
    description: def.description,
    canonical,
    currentPath: `/viz/${def.slug}`,
    ogType: "website",
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: def.title,
        description: def.description,
        url: canonical,
      },
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: def.title,
        description: def.description,
        url: canonical,
        creator: { "@type": "Organization", name: "NobodyNamed" },
        temporalCoverage: `${opts.dataMinYear ?? 1880}/${opts.dataMaxYear}`,
        license: "https://www.ssa.gov/oact/babynames/",
      },
    ],
    body,
    headExtras: `<style>
.factory-intro{max-width:44rem;color:var(--text);margin-bottom:1.5rem}
.chart-panel{max-width:44rem;margin:0 auto 2rem}
.factory-table{margin:0 auto 1rem}
.factory-source{font-size:.85rem;opacity:.7;text-align:center}
</style>`,
  });
}
