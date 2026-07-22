// Root-level editorial route aliases required for programmatic SEO.

import {
  buildMiniSparkline,
  decodeSpark,
  getMeta,
  listComeback,
  listDominantNamesWithSparks,
  listLandingWithSparks,
  META_KEYS,
  pageShell,
  renderLandingTableHTML,
  renderYearIndexHTML,
  SPARK_BUCKETS,
  type LandingKind,
  type LandingRow,
  type LandingTableKind,
  type NameRow,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

// Hubs whose name tables are otherwise built client-side (renderLandingTable in
// landing.js). We server-render the top rows so the page ships crawlable
// /name/ links in its initial HTML; the client still re-renders the full table.
const LANDING_KINDS = new Set<LandingTableKind>(["extinct", "endangered", "rising", "comeback"]);
const SSR_HUB_ROWS = 100;

interface EditorialSection {
  heading: string;
  body: string;
}

interface EditorialPageConfig {
  title: string;
  seoTitle?: string;
  seoDescription?: string;
  eyebrow: string;
  lede: string;
  names: string[];
  body: string;
  sections?: EditorialSection[];
  table?: string;
}

function shapeLandingRows(
  kind: LandingTableKind,
  rows: (NameRow & { spark_blob: ArrayBuffer | null })[],
): LandingRow[] {
  return rows.map((r) => {
    const spark = r.spark_blob ? decodeSpark(r.spark_blob) : [];
    const base = { name: r.name, sex: r.sex, peakYear: r.peak_year, peakCount: r.peak_count, spark };
    if (kind === "extinct") return { ...base, lastYearSeen: r.last_year };
    if (kind === "endangered") return { ...base, latestCount: r.latest_count, declinePct: r.decline_pct ?? 0 };
    return {
      ...base,
      latestCount: r.latest_count,
      prevDecadeTotal: r.prev_decade ?? 0,
      currDecadeTotal: r.curr_decade ?? 0,
      growthX: r.growth_x ?? null,
    };
  });
}

// `title` stays short — it drives the on-page <h1> and breadcrumb. `seoTitle`
// and `seoDescription` (optional) drive the <title>/meta tags: they lead with
// the page's signature names plus a hook, which earns clicks far better than a
// bare "<X> Baby Names" on competitive SERPs.
const PAGES: Record<string, EditorialPageConfig> = {
  comebacks: {
    title: "Comeback Baby Names | NobodyNamed",
    seoTitle: "Comeback Baby Names: Why Theodore, Hazel & Eleanor Returned | NobodyNamed",
    seoDescription: "Names that fell out of use and came roaring back — Theodore, Hazel, Eleanor, Violet, Oliver. See which vintage baby names are surging again, with the data behind each revival.",
    eyebrow: "Recovered names",
    lede: "Names that fell out of daily use, waited in the archive, and returned as taste, nostalgia, or status.",
    names: ["Theodore", "Hazel", "Eleanor", "Violet", "Oliver", "Emma"],
    body: "Comebacks reveal that naming culture is cyclical. A name can sound exhausted to one generation and newly authoritative to the next.",
    table: "comeback",
  },
  "millennial-names": {
    title: "Millennial Baby Names | NobodyNamed",
    seoTitle: "Millennial Baby Names: Michael, Jessica & the '80s–'90s Class | NobodyNamed",
    seoDescription: "The names that filled '80s and '90s classrooms — Michael, Jessica, Ashley, Christopher, Amanda. See the defining millennial baby names and how each one is aging now.",
    eyebrow: "Generation dossier",
    lede: "The classroom names of the 1980s and 1990s: high-volume, unmistakable, and now aging into cultural memory.",
    names: ["Michael", "Jessica", "Ashley", "Christopher", "Amanda", "Matthew"],
    body: "Millennial names are defined by saturation. Many were not merely popular; they were ambient facts of school rosters and suburban life.",
  },
  "gen-z-names": {
    title: "Gen Z Baby Names | NobodyNamed",
    seoTitle: "Gen Z Baby Names: Madison, Ethan & the 2000s Roster | NobodyNamed",
    seoDescription: "The names that defined Gen Z — Madison, Ethan, Ava, Aiden, Isabella. See how late-'90s and 2000s naming got faster, sharper, and more fashion-driven.",
    eyebrow: "Generation dossier",
    lede: "The names that rose through the late 1990s and 2000s as naming culture became faster, more fragmented, and more image-conscious.",
    names: ["Madison", "Ethan", "Ava", "Aiden", "Isabella", "Jayden"],
    body: "Gen Z naming patterns show sharper fashion cycles, more spelling variation, and a faster path from novelty to overexposure.",
  },
  "classic-names": {
    title: "Classic Baby Names",
    seoTitle: "Classic Baby Names — James, Anna & More | NobodyNamed",
    seoDescription: "Explore classic baby names that survived every trend, including James, Anna, Elizabeth and William. See 145 years of popularity and generational data.",
    eyebrow: "Durability file",
    lede: "Classic baby names remain recognizable across generations without belonging to only one decade. The SSA record shows which names endured rather than merely returning after a long absence.",
    names: ["James", "Elizabeth", "William", "Anna", "John", "Mary"],
    body: "NobodyNamed treats durability as a pattern in the data, not a claim about taste. A classic name appears across a long span of American births, avoids an irreversible collapse, and stays familiar even when its rank changes.",
    sections: [
      {
        heading: "What makes a baby name classic?",
        body: `A classic name survives several naming cycles. It can rise, decline, and change character without becoming trapped in one generation. <a href="/name/James/">James</a>, <a href="/name/Elizabeth/">Elizabeth</a>, <a href="/name/William/">William</a>, and <a href="/name/Anna/">Anna</a> all have different popularity curves, but each remained in active use while thousands of contemporary names disappeared. That continuity matters more than holding the number-one rank. A name can qualify as classic even when it spends years outside the top ten, provided parents continue choosing it in meaningful numbers and people of many ages still carry it. The result is a name that feels familiar without pointing to a single classroom, graduating class, or cultural moment.`,
      },
      {
        heading: "Classic names are not the same as comeback names",
        body: `Durability and revival describe different histories. <a href="/comeback">Comeback names</a> such as Hazel or Theodore fell sharply before a later generation rediscovered them. A durable classic never fully leaves the cultural vocabulary. Its curve may soften, but it keeps enough continuity to bridge grandparents, parents, and children. That difference is visible in the SSA series: a comeback has a valley followed by renewed growth, while a classic has a longer and steadier baseline. Some names can move between categories as new data arrives, so NobodyNamed treats these labels as descriptions of the recorded trajectory rather than permanent judgments about what parents should choose.`,
      },
      {
        heading: "How American classics change across generations",
        body: `Classic does not mean static. Mary dominated early records, James crossed nearly every era, and Anna repeatedly shifted between mainstream and vintage appeal. Compare the crowded rosters of the <a href="/names/1940s/">1940s</a> with the more fragmented choices of the <a href="/names/2020s/">2020s</a>: the same durable names occupy very different positions in each naming culture. Explore the dossiers above to see peak year, current births, median age, geographic strongholds, and the complete annual curve for each name. Together those measures show whether familiarity comes from uninterrupted use, broad geographic reach, repeated revivals, or sheer historical scale. They also reveal which present-day favorites may eventually earn classic status and which are still too closely tied to their moment.`,
      },
    ],
  },
  "future-grandparent-names": {
    title: "Future Grandparent Names | NobodyNamed",
    seoTitle: "Future Grandparent Names: Why Harper & Luna Will Sound Old | NobodyNamed",
    seoDescription: "Today's cutest baby names are tomorrow's grandparent names. See why Harper, Luna, Mason, and Ava are on track to age into the next generation of \"old\" names.",
    eyebrow: "Forecast by memory",
    lede: "The names that may sound young now, then ordinary, then old, then charmingly available again.",
    names: ["Harper", "Luna", "Mason", "Ava", "Liam", "Olivia"],
    body: "Every cute contemporary name is also a future old-person name. That is not an insult; it is the entire lifecycle of cultural identity.",
  },
};

export function getEditorialPageConfig(slug: string): Readonly<EditorialPageConfig> | undefined {
  return PAGES[slug];
}

export function renderEditorialCards(
  names: readonly string[],
  sparks: ReadonlyMap<string, number[]> = new Map(),
  minYear = 1880,
  maxYear = new Date().getFullYear() - 1,
): string {
  return names.map((name) => {
    const values = sparks.get(name.toLowerCase());
    const chart = values ? buildMiniSparkline(values, { name, minYear, maxYear }) : "";
    const chartClass = chart ? " diagnosis-card-with-spark" : "";
    return `<a class="diagnosis-card${chartClass}" href="/name/${encodeURIComponent(name)}/"><span class="card-name">${name}</span>${chart}<span class="card-status">Open dossier</span></a>`;
  }).join("");
}

export const onRequestGet: PagesFunction<Env, "slug"> = async (ctx) => {
  const slug = String(ctx.params.slug || "");

  // Pages Functions take precedence over static assets. Any slug that contains
  // a dot is a filename (e.g. extinct.html, favicon.svg) — use env.ASSETS to
  // serve it directly rather than ctx.next(), which is unreliable for static
  // asset serving from within route functions.
  if (slug.includes(".")) return ctx.env.ASSETS.fetch(ctx.request);
  // Serve static HTML pages directly — avoids redirect loops with Cloudflare Pages Pretty URLs.
  const staticPages = new Set(["extinct", "rising", "endangered", "comeback", "year", "about", "press"]);
  if (staticPages.has(slug)) {
    const assetRes = await ctx.env.ASSETS.fetch(new URL(`/${slug}.html`, ctx.request.url));
    let html = await assetRes.text();
    // Inject server-rendered, crawlable name/year links into the hubs that
    // otherwise build their tables client-side. Best-effort: on any D1 error
    // we fall back to the static shell, which the client JS still hydrates.
    try {
      if (LANDING_KINDS.has(slug as LandingTableKind)) {
        const kind = slug as LandingTableKind;
        const [rows, yMStr] = await Promise.all([
          kind === "comeback"
            ? listComeback(ctx.env.DB, SSR_HUB_ROWS)
            : listLandingWithSparks(ctx.env.DB, kind as LandingKind, SSR_HUB_ROWS),
          getMeta(ctx.env.DB, META_KEYS.maxYear),
        ]);
        const table = renderLandingTableHTML(kind, shapeLandingRows(kind, rows), Number(yMStr ?? 0));
        html = html.replace('<div id="t"></div>', `<div id="t">${table}</div>`);
      } else if (slug === "year") {
        const [ymStr, yMStr] = await Promise.all([
          getMeta(ctx.env.DB, META_KEYS.minYear),
          getMeta(ctx.env.DB, META_KEYS.maxYear),
        ]);
        const yM = Number(yMStr ?? 0);
        if (yM) {
          html = html.replace(
            '<div id="year-result"></div>',
            `<div id="year-result">${renderYearIndexHTML(Number(ymStr ?? 1880), yM)}</div>`,
          );
        }
      }
    } catch {
      // keep the static shell as-is
    }
    const headers = new Headers(assetRes.headers);
    headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(html, {
      status: assetRes.status,
      statusText: assetRes.statusText,
      headers,
    });
  }

  const page = PAGES[slug];
  if (!page) return new Response("not found", { status: 404 });

  let cardSparks: ReadonlyMap<string, number[]> = new Map();
  let cardMinYear = 1880;
  let cardMaxYear = new Date().getFullYear() - 1;
  if (slug === "classic-names") {
    try {
      const [rows, minYearValue, maxYearValue] = await Promise.all([
        listDominantNamesWithSparks(ctx.env.DB, page.names),
        getMeta(ctx.env.DB, META_KEYS.minYear),
        getMeta(ctx.env.DB, META_KEYS.maxYear),
      ]);
      const parsedMinYear = Number(minYearValue);
      const parsedMaxYear = Number(maxYearValue);
      if (
        Number.isFinite(parsedMinYear)
        && parsedMinYear > 0
        && Number.isFinite(parsedMaxYear)
        && parsedMaxYear > 0
        && parsedMaxYear >= parsedMinYear
      ) {
        cardMinYear = parsedMinYear;
        cardMaxYear = parsedMaxYear;
      }

      const decoded = new Map<string, number[]>();
      for (const row of rows) {
        try {
          const values = decodeSpark(row.spark_blob);
          if (values.length === SPARK_BUCKETS) decoded.set(row.name_lower.toLowerCase(), values);
        } catch {
          // A malformed optional spark row must not suppress the other cards.
        }
      }
      cardSparks = decoded;
    } catch {
      // D1/meta enrichment is optional; preserve the original linked cards.
    }
  }

  const cards = renderEditorialCards(page.names, cardSparks, cardMinYear, cardMaxYear);
  const table = page.table ? `<section class="section"><div id="t"></div></section>` : "";
  const tableScript = page.table ? `<script>renderLandingTable("${page.table}", document.getElementById("t"));</script>` : "";
  const editorialSections = page.sections?.map((section) => `
    <section class="section editorial-section">
      <h2>${section.heading}</h2>
      <p>${section.body}</p>
    </section>`).join("") ?? "";

  const reqUrl = new URL(ctx.request.url);
  const pageCanonical = `${reqUrl.origin}/${slug}`;
  const pageTitle = page.title.replace(" — NobodyNamed", "").replace(" | NobodyNamed", "");
  const ogImageUrl = `${reqUrl.origin}/api/og/default`;
  const structuredData = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: reqUrl.origin + "/" },
        { "@type": "ListItem", position: 2, name: pageTitle, item: pageCanonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: pageTitle,
      url: pageCanonical,
      description: page.lede,
      isPartOf: { "@type": "WebSite", name: "NobodyNamed", url: reqUrl.origin + "/" },
    },
  ]).replace(/</g, "\\u003c");

  return new Response(pageShell({
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? page.lede,
    canonical: pageCanonical,
    ogImage: ogImageUrl,
    ogType: "article",
    currentPath: `/${slug}`,
    body: `
    <p class="eyebrow">${page.eyebrow}</p>
    <h1>${page.title.replace(" — NobodyNamed", "")}</h1>
    <p class="lede">${page.lede}</p>
    <p class="archive-note">${page.body}</p>
    <div class="diagnosis-grid">${cards}</div>
    ${editorialSections}
    ${table}
  `,
    structuredData: JSON.parse(structuredData),
    scripts: ["/assets/app.js", "/assets/landing.js"],
    footerVariant: "minimal",
  }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      Link: `<${pageCanonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env, "slug"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
