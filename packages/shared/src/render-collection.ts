// Server-side renderers for the /collections/ namespace.
//
// Collection pages exist to be entry points, not isolated articles: every one
// ships a crawlable table of real /name/ links in its initial HTML, an ItemList
// in its structured data so the cluster is machine-readable as a curated set,
// and links to its sibling collections. Reuses pageShell and buildMiniSparkline
// so the pages inherit the existing stylesheet rather than adding one.

import { buildMiniSparkline } from "./mini-sparkline";
import { contentId, contentIdentityMeta } from "./content-identity";
import { decodeSpark } from "./spark-blob";
import { pageShell } from "./render-shell";
import {
  COLLECTION_PAGE_SIZE,
  GROUP_LABELS,
  GROUP_ORDER,
  type CollectionColumn,
  type CollectionDef,
  type CollectionGroup,
} from "./collections";
import type { CollectionMemberRow } from "./schema";

const SITE_NAME = "NobodyNamed";

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US");
}

const COLUMN_LABELS: Record<CollectionColumn, string> = {
  metric: "",
  peak: "Peak",
  latest: "Latest",
  total: "All-time",
  years: "Years on record",
  spark: "",
};

function headerCell(col: CollectionColumn, def: CollectionDef, maxYear: number): string {
  if (col === "metric") return `<th>${escape(def.metricHeading)}</th>`;
  if (col === "spark") return `<th><span class="visually-hidden">Trajectory</span></th>`;
  if (col === "latest") return `<th class="num">${maxYear}</th>`;
  if (col === "peak") return `<th class="num">Peak</th>`;
  return `<th class="num">${COLUMN_LABELS[col]}</th>`;
}

function bodyCell(
  col: CollectionColumn,
  row: CollectionMemberRow,
  minYear: number,
  maxYear: number,
): string {
  switch (col) {
    case "metric":
      return `<td>${escape(row.metric_label ?? "—")}</td>`;
    case "peak":
      return `<td class="num">${fmt(row.peak_count)} <span class="meta">${row.peak_year}</span></td>`;
    case "latest":
      return `<td class="num">${row.latest_count === 0 ? "none" : fmt(row.latest_count)}</td>`;
    case "total":
      return `<td class="num">${fmt(row.total_count)}</td>`;
    case "years":
      return `<td class="num">${row.first_year}–${row.last_year}</td>`;
    case "spark": {
      const values = row.spark_blob ? decodeSpark(row.spark_blob) : [];
      return `<td class="sparkcell">${buildMiniSparkline(values, { name: row.name, minYear, maxYear })}</td>`;
    }
  }
}

/**
 * The members table. Exported so tests can assert the crawlable-link contract
 * without building a whole document.
 */
export function renderCollectionTable(
  def: CollectionDef,
  rows: readonly CollectionMemberRow[],
  minYear: number,
  maxYear: number,
): string {
  if (!rows.length) {
    return `<p class="empty-state">No names currently qualify for this collection. It will populate when the next Social Security release is processed.</p>`;
  }
  const head = `<tr><th>Name</th>${def.columns.map((c) => headerCell(c, def, maxYear)).join("")}<th></th></tr>`;
  const body = rows
    .map((row) => {
      const href = `/name/${encodeURIComponent(row.name)}/`;
      const nameCell = `<td><a href="${href}">${escape(row.name)}</a> <span class="meta">${row.sex}</span></td>`;
      const cells = def.columns.map((c) => bodyCell(c, row, minYear, maxYear)).join("");
      return `<tr>${nameCell}${cells}<td><a href="${href}">Details →</a></td></tr>`;
    })
    .join("");
  return `<table class="table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function relatedNav(related: readonly CollectionDef[]): string {
  if (!related.length) return "";
  const links = related
    .map((r) => `<a href="/collections/${r.slug}/">${escape(r.title)}</a>`)
    .join("");
  return `<nav class="explore-links" aria-label="Related collections">
    <h2>Related collections</h2>
    <div class="explore-row">${links}</div>
    <p class="footer-note"><a href="/collections/">All collections</a></p>
  </nav>`;
}

function pagination(def: CollectionDef, page: number, total: number): string {
  const pages = Math.max(1, Math.ceil(total / COLLECTION_PAGE_SIZE));
  if (pages < 2) return "";
  const link = (n: number, label: string) =>
    `<a href="/collections/${def.slug}/${n > 1 ? `?page=${n}` : ""}" rel="${n < page ? "prev" : "next"}">${label}</a>`;
  const parts: string[] = [];
  if (page > 1) parts.push(link(page - 1, "← Previous"));
  parts.push(`<span class="meta">Page ${page} of ${pages}</span>`);
  if (page < pages) parts.push(link(page + 1, "Next →"));
  return `<nav class="pagination" aria-label="Pagination">${parts.join(" ")}</nav>`;
}

export interface CollectionPageOpts {
  canonical: string;
  origin: string;
  total: number;
  page: number;
  minYear: number;
  maxYear: number;
  related: CollectionDef[];
}

export function renderCollectionPage(
  def: CollectionDef,
  rows: readonly CollectionMemberRow[],
  opts: CollectionPageOpts,
): string {
  const pages = Math.max(1, Math.ceil(opts.total / COLLECTION_PAGE_SIZE));
  const identityMeta = contentIdentityMeta({
    contentId: contentId("article", `collection-${def.slug}`),
    contentType: "article",
    slug: def.slug,
  });

  const body = `<article class="report collection" ${identityMeta}>
  <header class="dossier-head">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/collections/">Collections</a> · ${escape(GROUP_LABELS[def.group])}</nav>
    <div class="sex">${escape(def.eyebrow)}</div>
    <h1>${escape(def.title)}</h1>
    <p class="lede">${escape(def.lede)}</p>
    <p class="meta">${fmt(opts.total)} name${opts.total === 1 ? "" : "s"} · Social Security records ${opts.minYear}–${opts.maxYear}</p>
  </header>

  <section class="collection-table" aria-label="${escape(def.title)}">
    ${renderCollectionTable(def, rows, opts.minYear, opts.maxYear)}
    ${pagination(def, opts.page, opts.total)}
  </section>

  <section class="collection-body">
    ${def.body}
  </section>

  ${relatedNav(opts.related)}
</article>`;

  // Pages beyond the first are follow-only: they are real content, but the
  // first page is the one that should rank for the cluster's phrase.
  const headExtras = [
    opts.page > 1 ? `<meta name="robots" content="noindex,follow">` : "",
    opts.page > 1
      ? `<link rel="prev" href="${escape(pageUrl(opts.origin, def.slug, opts.page - 1))}">`
      : "",
    opts.page < pages
      ? `<link rel="next" href="${escape(pageUrl(opts.origin, def.slug, opts.page + 1))}">`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return pageShell({
    title: def.seoTitle,
    description: def.seoDescription,
    canonical: opts.canonical,
    currentPath: `/collections/${def.slug}/`,
    body,
    headExtras,
    footerVariant: "full",
    footerYearRange: `${opts.minYear}–${opts.maxYear}`,
    structuredData: buildCollectionStructuredData(def, rows, opts),
  });
}

function pageUrl(origin: string, slug: string, page: number): string {
  return `${origin}/collections/${slug}/${page > 1 ? `?page=${page}` : ""}`;
}

/**
 * CollectionPage + an ItemList of the visible members. The ItemList is what
 * makes the cluster legible to a crawler as a curated set of names rather than
 * an article that happens to contain links.
 */
export function buildCollectionStructuredData(
  def: CollectionDef,
  rows: readonly CollectionMemberRow[],
  opts: { canonical: string; origin: string; total: number },
): object[] {
  // `position` is the member's rank in the whole collection, not its index on
  // this page: numberOfItems already declares the full total, so restarting at
  // 1 on ?page=2 would claim two different names both hold position 1. rank_in
  // is the stored curated rank, so it stays correct however the page is sliced.
  const items = rows.slice(0, 25).map((row, i) => ({
    "@type": "ListItem",
    position: row.rank_in ?? i + 1,
    name: row.name,
    url: `${opts.origin}/name/${encodeURIComponent(row.name)}/`,
  }));

  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: def.title,
      description: def.seoDescription,
      url: opts.canonical,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: opts.origin },
      ...(items.length
        ? {
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: opts.total,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              itemListElement: items,
            },
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Collections", item: `${opts.origin}/collections/` },
        { "@type": "ListItem", position: 2, name: def.title, item: opts.canonical },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

export interface HubEntry {
  def: CollectionDef;
  memberCount: number;
  samples: string[];
}

function hubCard(entry: HubEntry): string {
  const samples = entry.samples.length
    ? `<div class="meta">${entry.samples.map((n) => escape(n)).join(" · ")}</div>`
    : "";
  return `<a class="diagnosis-card" href="/collections/${entry.def.slug}/">
    <div class="label">${escape(entry.def.eyebrow)}</div>
    <h3>${escape(entry.def.title)}</h3>
    <p>${escape(entry.def.lede)}</p>
    ${samples}
    <div class="footer-note">${fmt(entry.memberCount)} names</div>
  </a>`;
}

export function renderCollectionsHub(
  entries: readonly HubEntry[],
  opts: { canonical: string; origin: string; minYear: number; maxYear: number },
): string {
  const grouped = {} as Record<CollectionGroup, HubEntry[]>;
  for (const g of GROUP_ORDER) grouped[g] = [];
  for (const entry of entries) grouped[entry.def.group].push(entry);

  const sections = GROUP_ORDER.filter((g) => grouped[g].length)
    .map(
      (g) => `<section class="collection-group">
      <h2>${escape(GROUP_LABELS[g])}</h2>
      <div class="diagnosis-grid">${grouped[g].map(hubCard).join("")}</div>
    </section>`,
    )
    .join("");

  const totalNames = entries.reduce((n, e) => n + e.memberCount, 0);

  const body = `<article class="report collections-hub">
  <header class="dossier-head">
    <div class="sex">Editorial collections</div>
    <h1>Collections</h1>
    <p class="lede">Groupings built from the American birth record itself — names that appeared once, names that never left one state, names down to their last few births.</p>
    <p class="meta">${entries.length} collections · ${fmt(totalNames)} name entries · Social Security records ${opts.minYear}–${opts.maxYear}</p>
  </header>
  ${
    sections ||
    `<p class="empty-state">Collections populate once name facts have been built. Run <code>npm run build-name-facts</code> followed by <code>npm run seed-name-facts</code>.</p>`
  }
</article>`;

  return pageShell({
    title: "Name Collections: Rare, Lost and Regional American Names | NobodyNamed",
    description:
      "Editorial groupings of American first names built from Social Security birth records — names given to fewer than ten babies, names that appeared once, lost names of each decade, and names unique to one state.",
    canonical: opts.canonical,
    currentPath: "/collections/",
    body,
    footerVariant: "full",
    footerYearRange: `${opts.minYear}–${opts.maxYear}`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Name Collections",
      url: opts.canonical,
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: opts.origin },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: entries.length,
        itemListElement: entries.slice(0, 50).map((e, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: e.def.title,
          url: `${opts.origin}/collections/${e.def.slug}/`,
        })),
      },
    },
  });
}
