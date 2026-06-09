// HTML renderer for /year/:year/ — top names for a specific birth year.

import { pageShell } from "./render-shell";

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
  // Lead the title with the year's actual #1 names: specific, truthful, and far
  // more clickable than the generic "Top baby names in <year>" that was stranded
  // at ~0% CTR despite page-1 rankings (see docs/seo/2026-06-09-gsc-blog-demand.md).
  const topGirlName = [...rows].filter((r) => r.sex === "F").sort((a, b) => a.rank - b.rank)[0]?.name;
  const topBoyName = [...rows].filter((r) => r.sex === "M").sort((a, b) => a.rank - b.rank)[0]?.name;
  const hasLeaders = Boolean(topGirlName && topBoyName);
  const title = hasLeaders
    ? `Top Baby Names of ${year}: ${topGirlName} & ${topBoyName} Led the Year | NobodyNamed`
    : `Top Baby Names of ${year}: Most Popular Boys & Girls | NobodyNamed`;
  const desc = `The most popular baby names of ${year}, ranked by Social Security Administration birth records.${hasLeaders ? ` ${topGirlName} and ${topBoyName} topped the list —` : ""} see the full top 25 boys and girls, with peak counts and how each name has aged since.`;
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

  return pageShell({
    title,
    description: desc,
    canonical: opts.canonical,
    ogImage: ogImageUrl,
    ogType: "article",
    currentPath: "/year",
    body: `
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
  `,
    structuredData: JSON.parse(structuredData),
    scripts: ["/assets/app.js", "/assets/landing.js"],
    footerVariant: "minimal",
    footerYearRange: `1880–${year}`,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US");
}
