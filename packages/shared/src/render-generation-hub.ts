// SSR renderer for the generation hubs (/names/millennials/, /names/boomers/).
//
// Reuses the decade-hub system's established patterns rather than inventing a
// parallel abstraction: the same pageShell, the same dh-* CSS classes (visual
// identity), the same structured-data shapes (BreadcrumbList + WebPage +
// ItemList), and the same data-content-* analytics identity convention. The
// difference is that generation profiles are computed at request time from the
// annual SSA tables (see generation-hub-compute.ts) instead of being read from
// a precomputed D1 payload.

import { pageShell } from "./render-shell";
import { contentId } from "./content-identity";
import { GENERATION_DEFINITIONS, type GenerationDefinition } from "./content/generation-definitions";
import type { GenerationNameRow, GenerationProfile } from "./generation-hub-compute";

export interface GenerationPageOpts {
  origin: string;
  definition: GenerationDefinition;
  profile: GenerationProfile;
}

const BROWSE_NAV = [
  { label: "Extinct", href: "/extinct" },
  { label: "Endangered", href: "/endangered" },
  { label: "Comebacks", href: "/comeback" },
  { label: "Birth year", href: "/year" },
  { label: "By decade", href: "/names/1880s/" },
  { label: "By initial", href: "/names/a/" },
  { label: "By ending", href: "/names/ending/a/" },
  { label: "Rising", href: "/rising" },
  { label: "About", href: "/about" },
];

const PUBLISHER_ORG = { "@type": "Organization" as const, name: "NobodyNamed", url: "https://nobodynamed.com/" };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US");
}

function pct(share: number, digits = 1): string {
  return `${(share * 100).toFixed(digits)}%`;
}

function nameHref(name: string): string {
  return `/name/${encodeURIComponent(name)}/`;
}

function breadcrumb(origin: string, items: { name: string; path: string }[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      ...items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 2,
        name: item.name,
        item: origin + item.path,
      })),
    ],
  };
}

function webPage(origin: string, title: string, description: string, canonical: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url: canonical,
    description,
    isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: `${origin}/` },
    publisher: PUBLISHER_ORG,
  };
}

/** The human label for a window, e.g. "1981–1996". */
function windowLabel(profile: GenerationProfile): string {
  return `${profile.startYear}–${profile.observedEnd}`;
}

function championName(row: GenerationNameRow | undefined, fallback: string): string {
  return row ? escapeHtml(row.name) : fallback;
}

/** Computed copy: the biggest names of the generation. */
function lede(profile: GenerationProfile): string {
  const girls = profile.femaleChampion;
  const boys = profile.maleChampion;
  return `The names recorded most often for ${profile.label.toLowerCase()} births, summed from SSA records for ${windowLabel(profile)}: ${championName(girls, "the leading girls' name")} led the girls and ${championName(boys, "the leading boys' name")} led the boys — but the full roster below tells the real story of the generation's classrooms.`;
}

/** Computed copy: how the generation's names shifted from the previous window. */
function shiftParagraph(profile: GenerationProfile): string {
  const previous = profile.previous;
  if (!previous) return "";
  const prevGirls = previous.femaleChampion ? escapeHtml(previous.femaleChampion.name) : "";
  const prevBoys = previous.maleChampion ? escapeHtml(previous.maleChampion.name) : "";
  const thisGirls = championName(profile.femaleChampion, "");
  const thisBoys = championName(profile.maleChampion, "");
  if (!prevGirls && !prevBoys) return "";
  const girlShift =
    prevGirls && thisGirls
      ? prevGirls === thisGirls
        ? `${prevGirls} held the girls' lead in both windows`
        : `the girls' champion turned over, from ${prevGirls} to ${thisGirls}`
      : "";
  const boyShift =
    prevBoys && thisBoys
      ? prevBoys === thisBoys
        ? `${prevBoys} held the boys' lead in both windows`
        : `the boys' champion turned over, from ${prevBoys} to ${thisBoys}`
      : "";
  const shift = [girlShift, boyShift].filter(Boolean).join(", and ");
  return `How the ${previous.label.toLowerCase()} window (${previous.startYear}–${previous.endYear}) gave way: ${shift}. The tables below show which names carried that change.`;
}

/** One accessible ranking table per sex. */
function nameTable(rows: GenerationNameRow[], caption: string): string {
  const body = rows
    .map(
      (row) => `<tr>
  <td class="num">${row.rank}</td>
  <th scope="row"><a href="${nameHref(row.name)}">${escapeHtml(row.name)}</a></th>
  <td class="num">${fmt(row.windowTotal)}</td>
  <td class="num">${fmt(row.lifetimeTotal)}</td>
  <td class="num" data-dh-sort-value="${row.windowShare}">${pct(row.windowShare)}</td>
</tr>`,
    )
    .join("\n");
  return `<table class="table dh-table">
  <caption>${escapeHtml(caption)}</caption>
  <thead><tr>
    <th scope="col" class="num">Rank</th>
    <th scope="col">Name</th>
    <th scope="col" class="num">Births in window</th>
    <th scope="col" class="num">Lifetime births</th>
    <th scope="col" class="num">Share of lifetime</th>
  </tr></thead>
  <tbody>
${body}
  </tbody>
</table>`;
}

function signatureList(rows: GenerationNameRow[], sexLabel: string): string {
  if (!rows.length) return "";
  return `<h3>${sexLabel}</h3><ul class="dh-signature-list">${rows
    .map(
      (row) =>
        `<li><a href="${nameHref(row.name)}">${escapeHtml(row.name)}</a> <span class="dh-stat-note">${pct(row.windowShare)} of its lifetime in the window</span></li>`,
    )
    .join("")}</ul>`;
}

function decadeLinks(definition: GenerationDefinition): string {
  return `<nav class="decade-nav" aria-label="Constituent decade hubs">${definition.decadeLinks
    .map((link) => `<a href="/names/${link.slug}/" data-track-target-id="decade-hub:${link.slug}" data-track-target-type="decade-hub">${escapeHtml(link.anchor)}</a>`)
    .join(" ")}</nav>`;
}

export function renderGenerationHub(opts: GenerationPageOpts): string {
  const { origin, definition, profile } = opts;
  const canonical = `${origin}/names/${definition.slug}/`;
  const period = `${profile.startYear}–${profile.observedEnd}`;
  const girlsChampion = championName(profile.femaleChampion, "");
  const boysChampion = championName(profile.maleChampion, "");
  const title = `${definition.titlePhrase}: ${boysChampion} & ${girlsChampion} Led ${period} | NobodyNamed`;
  const desc = `The most popular ${definition.seoLabel} names from SSA records, ${period}: ${girlsChampion} and ${boysChampion} led the generation — see the top 25 girls' and boys' names and the names most tied to the era.`;
  const h1 = `${definition.label} baby names`;
  const coverageLabel = profile.isComplete
    ? `${period} (complete)`
    : `${period} so far · data through ${profile.observedEnd}`;

  const editorial = `<section class="dh-thesis">
  <h2>${escapeHtml(definition.heading)}</h2>
  ${definition.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n  ")}
</section>`;

  const scorecard = `<dl class="dh-scorecard">
  <div class="dh-stat dh-stat-champion"><dt>Girls' popularity champion</dt><dd><a href="${nameHref(profile.femaleChampion.name)}">${escapeHtml(profile.femaleChampion.name)}</a> <span class="dh-stat-note">${fmt(profile.femaleChampion.windowTotal)} births</span></dd></div>
  <div class="dh-stat dh-stat-champion"><dt>Boys' popularity champion</dt><dd><a href="${nameHref(profile.maleChampion.name)}">${escapeHtml(profile.maleChampion.name)}</a> <span class="dh-stat-note">${fmt(profile.maleChampion.windowTotal)} births</span></dd></div>
  <div class="dh-stat"><dt>Window</dt><dd>${profile.startYear}–${profile.observedEnd}</dd></div>
  <div class="dh-stat"><dt>Total recorded births</dt><dd>${fmt(profile.totalBirths)}</dd></div>
  <div class="dh-stat"><dt>Girls / boys</dt><dd>${fmt(profile.femaleBirths)} / ${fmt(profile.maleBirths)}</dd></div>
  <div class="dh-stat"><dt>Coverage</dt><dd>${profile.isComplete ? "Complete window" : "Partial window"}</dd></div>
</dl>`;

  const signatureSection =
    profile.signatureGirls.length || profile.signatureBoys.length
      ? `<section class="dh-signature" data-dh-module="signature">
  <h2>Signature names of the generation</h2>
  <p>These names have the largest share of their recorded lifetime inside ${period} (among the top-25 names of their sex, minimum 5,000 lifetime births). Popularity measures size; this measures how tightly a name's history belongs to this generation.</p>
  <div class="dh-signature-grid">
    ${signatureList(profile.signatureGirls, "Girls")}
    ${signatureList(profile.signatureBoys, "Boys")}
  </div>
</section>`
      : "";

  const shift = shiftParagraph(profile);

  const body = `<div class="dh-page" data-content-id="${contentId("generation-hub", definition.slug)}" data-content-type="generation-hub" data-content-slug="${escapeHtml(definition.slug)}">
<header class="dh-hero">
  <p class="eyebrow">Generation hub</p>
  <h1>${h1}</h1>
  <p class="lede">${lede(profile)}</p>
  ${editorial}
  ${scorecard}
  <p class="dh-coverage-label">${escapeHtml(coverageLabel)}</p>
</header>
${signatureSection}
${shift ? `<section class="dh-shift"><h2>How the ${escapeHtml(profile.previous?.label ?? "previous generation")} gave way</h2><p>${shift}</p></section>` : ""}
<section class="dh-rankings" data-dh-module="rankings">
  <h2>The most popular ${definition.seoLabel} names</h2>
  <p>Ranked by recorded SSA births inside ${period}. “Share of lifetime” compares each name's births in the window with its recorded total through ${profile.dataThroughYear} — the higher the share, the more the name belongs to this generation.</p>
  <div class="year-result-grid">
    <div class="year-col">${nameTable(profile.girls, `Most popular ${definition.seoLabel} girls' names, ${period}`)}</div>
    <div class="year-col">${nameTable(profile.boys, `Most popular ${definition.seoLabel} boys' names, ${period}`)}</div>
  </div>
</section>
<section class="dh-decades" data-dh-module="decades">
  <h2>Explore the decades behind the generation</h2>
  <p>The window crosses calendar decades, and each decade hub has its own profile — champions, ownership scores, classrooms, spelling families. Jump into the ones that make up this generation:</p>
  ${decadeLinks(definition)}
</section>
<section class="dh-methodology-callout">
  <h2>Methodology and source</h2>
  <p>Every figure on this page is computed from U.S. Social Security Administration national birth records for exactly ${profile.startYear}–${profile.observedEnd}, summed from the same annual data the decade hubs are built from. Nothing is estimated and nothing is recalculated in your browser.</p>
  <p>${escapeHtml(definition.boundaryNote)}</p>
  <p>The source suppresses name-and-sex counts below 5 per year, so very rare names are under-counted everywhere on this page. Records reflect sex as recorded at birth, in two categories; they are not a record of gender identity. “Lifetime” births mean recorded births from 1880 through ${profile.dataThroughYear}, the SSA file's own span.</p>
  <p><a href="/about">About the data</a> · <a href="https://www.ssa.gov/oact/babynames/limits.html">SSA source</a></p>
</section>
<dl class="dh-coverage" aria-label="Data coverage and provenance">
  <div class="dh-coverage-item"><dt>Window</dt><dd>${profile.startYear}–${profile.endYear}; data through ${profile.dataThroughYear}</dd></div>
  <div class="dh-coverage-item"><dt>Completeness</dt><dd>${profile.isComplete ? "Complete window" : "Partial window"}</dd></div>
  <div class="dh-coverage-item"><dt>Source</dt><dd>SSA national birth records (annual files)</dd></div>
</dl>
</div>`;

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `The most popular ${definition.seoLabel} names, by recorded births`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: profile.girls.length + profile.boys.length,
    itemListElement: [...profile.girls, ...profile.boys].map((row, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: { "@type": "Thing", name: row.name, url: origin + nameHref(row.name) },
    })),
  };

  return pageShell({
    title,
    description: desc,
    canonical,
    ogImage: `${origin}/api/og/default`,
    ogType: "article",
    currentPath: `/names/${definition.slug}/`,
    headerOpts: { navItems: BROWSE_NAV },
    body,
    structuredData: [
      breadcrumb(origin, [
        { name: "Names by decade", path: "/names/1880s/" },
        { name: `${definition.label} names`, path: `/names/${definition.slug}/` },
      ]),
      webPage(origin, title, desc, canonical),
      itemList,
    ],
    scripts: ["/assets/app.js"],
    footerVariant: "minimal",
    footerYearRange: `1880–${profile.dataThroughYear}`,
  });
}

/** Generation definitions in registry order, for tests and future navigation. */
export const GENERATION_REGISTRY = GENERATION_DEFINITIONS;
