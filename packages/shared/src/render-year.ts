// HTML renderer for /year/:year/ — top names for a specific birth year.

import { pageShell, APP_JS_SRC, LANDING_JS_SRC } from "./render-shell";

export interface YearNameRow {
  name: string;
  sex: string;
  count: number;
  rank: number;
}

export interface YearPageExtras {
  // Classified status per "name|sex" (see statusesForNames). Rows without an
  // entry render without a chip.
  statuses?: Map<string, { status: string; latest_count: number }>;
  // Every year's #1 names (see listNumberOneNames). Empty = omit the
  // years-at-#1 clause.
  numberOnes?: { year: number; sex: string; name: string }[];
}

// Names shown per sex. name_rankings_by_year stores 200, so this stays on the
// precomputed read path.
export const YEAR_PAGE_PER_SEX = 100;

// Same "still common" floor render-name.ts uses to relabel endangered names.
const STILL_COMMON_THRESHOLD = 5000;

// Birth-cohort label for the intro. Boundaries match generationForYear() in
// render-name.ts so the two templates never disagree about a year.
function eraForYear(year: number): string {
  if (year >= 2013) return "Gen Alpha";
  if (year >= 1997) return "Gen Z";
  if (year >= 1981) return "millennial";
  if (year >= 1965) return "Gen X";
  if (year >= 1946) return "baby boom";
  if (year >= 1928) return "Silent Generation";
  if (year >= 1901) return "Greatest Generation";
  return "late-19th-century";
}

function statusLabel(s: { status: string; latest_count: number }): string {
  switch (s.status) {
    case "rising":
      return "Rising";
    case "stable":
      return "Stable";
    case "declining":
      return "Declining";
    case "endangered":
      return s.latest_count >= STILL_COMMON_THRESHOLD ? "Past peak" : "Endangered";
    case "extinct":
      return "Extinct";
    default:
      return "";
  }
}

// "the #1 girls' name for 14 years (1985–1998)" — the data-backed clause that
// replaced the old hard-coded "perennial powerhouse" list.
function leaderClause(
  name: string,
  sex: "F" | "M",
  year: number,
  numberOnes: { year: number; sex: string; name: string }[],
): string {
  const years = numberOnes.filter((r) => r.sex === sex && r.name === name).map((r) => r.year);
  if (!years.includes(year)) return "";
  const noun = sex === "F" ? "girls\u2019 name" : "boys\u2019 name";
  if (years.length === 1) return `${year} was ${escapeHtml(name)}\u2019s only year as the #1 ${noun}`;
  const first = years[0]!;
  const last = years[years.length - 1]!;
  const contiguous = last - first + 1 === years.length;
  const span = contiguous ? `${first}\u2013${last}` : `between ${first} and ${last}`;
  return `${escapeHtml(name)} was the #1 ${noun} for ${years.length} years in all (${span})`;
}

const PUBLISHER_ORG = {
  "@type": "Organization" as const,
  name: "NobodyNamed",
  url: "https://nobodynamed.com/",
};

export function renderYearPage(
  year: number,
  rows: YearNameRow[],
  opts: { canonical: string; origin?: string; prevYear?: number | null; nextYear?: number | null } & YearPageExtras,
): string {
  // Lead the title with the year's actual #1 names: specific, truthful, and far
  // more clickable than the generic "Top baby names in <year>" that was stranded
  // at ~0% CTR despite page-1 rankings (see docs/seo/2026-06-09-gsc-blog-demand.md).
  const topGirlName = [...rows].filter((r) => r.sex === "F").sort((a, b) => a.rank - b.rank)[0]?.name;
  const topBoyName = [...rows].filter((r) => r.sex === "M").sort((a, b) => a.rank - b.rank)[0]?.name;
  const hasLeaders = Boolean(topGirlName && topBoyName);
  const title = hasLeaders
    ? `Top 100 Baby Names of ${year}: ${topGirlName} & ${topBoyName}`
    : `Top 100 Baby Names of ${year}: Boys & Girls`;
  const desc = `The top 100 baby names of ${year} from SSA birth records.${hasLeaders ? ` ${topGirlName} & ${topBoyName} led.` : ""} See how each name has fared since.`;
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

  const girls = rows.filter((r) => r.sex === "F").slice(0, YEAR_PAGE_PER_SEX);
  const boys = rows.filter((r) => r.sex === "M").slice(0, YEAR_PAGE_PER_SEX);
  const statuses = opts.statuses;

  const chip = (r: YearNameRow): string => {
    const s = statuses?.get(`${r.name}|${r.sex}`);
    if (!s) return "";
    const label = statusLabel(s);
    return label ? ` <span class="year-status year-status-${escapeHtml(s.status)}">${label}</span>` : "";
  };

  const nameList = (list: YearNameRow[]) =>
    list
      .map(
        (r) =>
          `<li><span class="rank">#${r.rank}</span><span class="year-name"><a href="/name/${encodeURIComponent(r.name)}/">${escapeHtml(r.name)}</a>${chip(r)}</span><span class="count">${fmt(r.count)}</span></li>`,
      )
      .join("");

  // How many of this year's top names have since dropped to endangered or
  // extinct — the "how many have faded" promise the intro makes.
  const listed = [...girls, ...boys];
  const faded = statuses
    ? listed.filter((r) => {
        const s = statuses.get(`${r.name}|${r.sex}`);
        return s && (s.status === "extinct" || (s.status === "endangered" && s.latest_count < STILL_COMMON_THRESHOLD));
      }).length
    : 0;
  const statusCount = statuses ? listed.filter((r) => statuses.has(`${r.name}|${r.sex}`)).length : 0;

  const numberOnes = opts.numberOnes ?? [];
  const leaderSentences = hasLeaders
    ? [leaderClause(topGirlName!, "F", year, numberOnes), leaderClause(topBoyName!, "M", year, numberOnes)].filter(Boolean)
    : [];
  const storyParts: string[] = [];
  if (hasLeaders) {
    storyParts.push(
      `${escapeHtml(topGirlName!)} and ${escapeHtml(topBoyName!)} led the ${year} baby-name charts, the top names among ${eraForYear(year)} births.`,
    );
    if (leaderSentences.length) storyParts.push(`${leaderSentences.join("; ")}.`);
  }
  if (statusCount > 0) {
    storyParts.push(
      faded > 0
        ? `Of the ${statusCount} names below, ${faded} ${faded === 1 ? "is" : "are"} now endangered or extinct; the tag on each shows where it stands today.`
        : `The tag on each name below shows where it stands today.`,
    );
  }

  const prevLink = opts.prevYear ? `<a href="/year/${opts.prevYear}/">← ${opts.prevYear}</a>` : "";
  const nextLink = opts.nextYear ? `<a href="/year/${opts.nextYear}/">${opts.nextYear} →</a>` : "";
  const yearNav = [prevLink, nextLink].filter(Boolean).join(" ");
  const decadeStart = Math.floor(year / 10) * 10;

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
    <p class="lede">The ${YEAR_PAGE_PER_SEX} most common names on ${year} birth certificates, for girls and boys, ranked by SSA records.</p>
    ${storyParts.length ? `<p class="year-story">${storyParts.join(" ")}</p>` : ""}
    ${yearNav ? `<nav class="decade-nav" aria-label="Adjacent years">${yearNav}</nav>` : ""}
    <p class="year-story"><a href="/names/${decadeStart}s/">Explore the ${decadeStart}s decade</a></p>
    <div class="year-result-grid">
      <div class="year-col">
        <h2>Girls</h2>
        <ul class="year-name-list">${nameList(girls)}</ul>
      </div>
      <div class="year-col">
        <h2>Boys</h2>
        <ul class="year-name-list">${nameList(boys)}</ul>
      </div>
    </div>
  `,
    structuredData: JSON.parse(structuredData),
    scripts: [APP_JS_SRC, LANDING_JS_SRC],
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
