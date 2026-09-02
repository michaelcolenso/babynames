// HTML renderer for /state/:state/ — top baby names within one US state for
// the latest year of SSA state-level data (1910–2024; the state file lags the
// national file by one release cycle).

import { pageShell } from "./render-shell";
import { STATE_NAMES, stateToSlug, ALL_STATES } from "./us-states-map";
import type { StateTopRow, StateYearTotals } from "./d1-queries";

const PUBLISHER_ORG = {
  "@type": "Organization" as const,
  name: "NobodyNamed",
  url: "https://nobodynamed.com/",
};

export interface RenderStatePageOpts {
  canonical: string;
  origin?: string;
  /** Previous year of state data, when it exists (for YoY risers/fallers). */
  prevYear?: number | null;
  prevRows?: StateTopRow[];
  totals?: StateYearTotals | null;
  /** First and last year of state-level data (SSA state files start 1910). */
  stateYearMin: number;
  stateYearMax: number;
  /** Older-year views (?year=) are crawlable but not indexed separately from
   * the latest-year hub. */
  noindex?: boolean;
}

interface DistinctiveRow extends StateTopRow {
  /** nationalRank - rank; how many places the name outperforms locally. */
  gap: number;
}

export function renderStatePage(state: string, year: number, rows: StateTopRow[], opts: RenderStatePageOpts): string {
  const stateName = STATE_NAMES[state] ?? state;
  const origin = opts.origin || new URL(opts.canonical).origin;
  const ogImageUrl = `${origin}/api/og/default`;
  const dataDate = `${year}-05-15`;

  const girls = rows.filter((r) => r.sex === "F").sort((a, b) => a.rank - b.rank);
  const boys = rows.filter((r) => r.sex === "M").sort((a, b) => a.rank - b.rank);
  const topGirl = girls[0]?.name;
  const topBoy = boys[0]?.name;
  const hasLeaders = Boolean(topGirl && topBoy);

  const title = hasLeaders
    ? `Most Popular Baby Names in ${stateName} (${year}): ${topGirl} & ${topBoy} Lead | NobodyNamed`
    : `Most Popular Baby Names in ${stateName} (${year}) | NobodyNamed`;
  const desc = `The most popular baby names in ${stateName} in ${year}, ranked by SSA state birth records.${hasLeaders ? ` ${topGirl} and ${topBoy} led the state —` : ""} see the top 100, the names most distinctively ${demonymSafe(stateName)}, and how state ranks compare to national ones.`;

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        { "@type": "ListItem", position: 2, name: "By state", item: origin + "/state/" },
        { "@type": "ListItem", position: 3, name: stateName, item: opts.canonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      url: opts.canonical,
      description: desc,
      isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: origin + "/" },
      publisher: PUBLISHER_ORG,
      datePublished: dataDate,
      dateModified: dataDate,
      mainEntity: {
        "@type": "Dataset",
        name: `Top baby names in ${stateName}, ${year}`,
        description: `Social Security Administration baby-name rankings for ${stateName} in ${year}.`,
        temporalCoverage: `${opts.stateYearMin}/${year}`,
        spatialCoverage: { "@type": "AdministrativeArea", name: stateName },
        creator: {
          "@type": "Organization",
          name: "Social Security Administration",
          url: "https://www.ssa.gov/oact/babynames/",
        },
        keywords: ["baby names", stateName, "popular names", String(year), "SSA", "state rankings"],
      },
    },
  ];

  // "Distinctively local": names whose state rank most outperforms their
  // national rank. Names outside the stored national top 200 (nationalRank
  // null) are the strongest signal of all — treat them as rank 201 for gap
  // math so they still surface, labeled accurately.
  const distinctive: DistinctiveRow[] = rows
    .map((r) => ({ ...r, gap: (r.nationalRank ?? 201) - r.rank }))
    .filter((r) => r.gap >= 25 && r.rank <= 100)
    .sort((a, b) => b.gap - a.gap || a.rank - b.rank)
    .slice(0, 12);

  // YoY risers/fallers among names ranked in both years.
  const prevRows = opts.prevRows ?? [];
  const prevRank = new Map<string, number>();
  for (const r of prevRows) prevRank.set(`${r.sex}|${r.name}`, r.rank);
  const movers = rows
    .filter((r) => prevRank.has(`${r.sex}|${r.name}`))
    .map((r) => ({ ...r, delta: (prevRank.get(`${r.sex}|${r.name}`) ?? r.rank) - r.rank }))
    .filter((r) => r.delta !== 0);
  const risers = movers.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 8);
  const fallers = movers.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 8);

  const nameList = (list: StateTopRow[]) =>
    list
      .slice(0, 100)
      .map((r) => {
        const national = r.nationalRank ? `<span class="count">US #${r.nationalRank}</span>` : "";
        return `<li><span class="rank">#${r.rank}</span><a href="/name/${encodeURIComponent(r.name)}/">${escapeHtml(r.name)}</a><span class="count">${fmt(r.count)}</span>${national}</li>`;
      })
      .join("");

  const distinctiveList = distinctive
    .map((r) => {
      const national = r.nationalRank ? `#${r.nationalRank} nationally` : "outside the national top 200";
      return `<li><span class="rank">#${r.rank}</span><a href="/name/${encodeURIComponent(r.name)}/">${escapeHtml(r.name)}</a><span class="count">${national}</span></li>`;
    })
    .join("");

  const moverList = (list: Array<StateTopRow & { delta: number }>) =>
    list
      .map((r) => {
        const arrow = r.delta > 0 ? `↑${r.delta}` : `↓${Math.abs(r.delta)}`;
        return `<li><span class="rank">${arrow}</span><a href="/name/${encodeURIComponent(r.name)}/">${escapeHtml(r.name)}</a><span class="count">#${r.rank}</span></li>`;
      })
      .join("");

  const stateLinks = ALL_STATES.map((s) =>
    s === state
      ? `<a href="/state/${stateToSlug(s)}/" aria-current="page">${escapeHtml(STATE_NAMES[s] ?? s)}</a>`
      : `<a href="/state/${stateToSlug(s)}/">${escapeHtml(STATE_NAMES[s] ?? s)}</a>`,
  ).join("\n      ");

  const totalsLine = opts.totals
    ? `The SSA recorded ${fmt(opts.totals.births)} ${stateName} births in ${year} across ${fmt(opts.totals.names)} distinct names.`
    : "";

  return pageShell({
    title,
    description: desc,
    canonical: opts.canonical,
    ogImage: ogImageUrl,
    ogType: "article",
    currentPath: "/state",
    body: `
    <p class="eyebrow">State roster</p>
    <h1>Top names in ${escapeHtml(stateName)}</h1>
    <p class="lede">The names most likely to appear on ${year} ${escapeHtml(stateName)} birth certificates, ranked by SSA state records. ${totalsLine}</p>
    ${distinctive.length ? `
    <h2>Distinctively ${escapeHtml(stateName)}</h2>
    <p class="year-story">Names that rank far higher here than they do nationally — the ones that say ${escapeHtml(stateName)} more than they say America.</p>
    <ul class="year-name-list">${distinctiveList}</ul>` : ""}
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
    ${risers.length || fallers.length ? `
    <h2>On the move since ${opts.prevYear}</h2>
    <div class="year-result-grid">
      <div class="year-col">
        <h3>Rising</h3>
        <ul class="year-name-list">${moverList(risers)}</ul>
      </div>
      <div class="year-col">
        <h3>Falling</h3>
        <ul class="year-name-list">${moverList(fallers)}</ul>
      </div>
    </div>` : ""}
    <h2>Every state</h2>
    <nav class="decade-nav" aria-label="Names by state">
      ${stateLinks}
    </nav>
    <p class="year-story">State-level SSA records cover ${opts.stateYearMin}–${opts.stateYearMax} — a shorter window than the national archive, which runs back to 1880.${opts.prevYear ? ` <a href="/state/${stateToSlug(state)}/?year=${opts.prevYear}">See ${opts.prevYear} rankings</a>.` : ""}</p>
  `,
    structuredData,
    headExtras: opts.noindex ? '<meta name="robots" content="noindex">' : undefined,
    scripts: ["/assets/app.js", "/assets/landing.js"],
    footerVariant: "minimal",
    footerYearRange: `${opts.stateYearMin}–${opts.stateYearMax}`,
  });
}

// "Californian" demonyms are a rabbit hole; for copy purposes the state name
// itself reads fine ("most distinctively California" → "most distinctively
// California names"). Kept as a seam in case a demonym table is added later.
function demonymSafe(stateName: string): string {
  return stateName;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return Number(n).toLocaleString("en-US");
}
