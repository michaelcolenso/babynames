// Root-level editorial route aliases required for programmatic SEO.

import {
  buildMiniSparkline,
  contentId,
  contentIdentityMeta,
  decodeSpark,
  getMeta,
  listComeback,
  listDominantNamesWithSparks,
  listLandingWithSparks,
  listMomentum,
  META_KEYS,
  pageShell,
  renderLandingTableHTML,
  renderMomentumGridHTML,
  renderYearIndexHTML,
  SPARK_BUCKETS,
  type LandingKind,
  type LandingRow,
  type LandingTableKind,
  type MomentumDirection,
  type MomentumRouteName,
  type NameRow,
  APP_JS_SRC,
  LANDING_JS_SRC,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

// Hubs whose name tables are otherwise built client-side (renderLandingTable in
// landing.js). We server-render the top rows so the page ships crawlable
// /name/ links in its initial HTML; the client still re-renders the full table.
const LANDING_KINDS = new Set<LandingTableKind>(["extinct", "endangered", "rising", "comeback"]);
const MOMENTUM_ROUTES: Record<string, MomentumDirection> = { emerging: "rising", fading: "fading" };
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

// `title` stays short and carries no brand suffix — it drives the on-page <h1>
// and breadcrumb verbatim. `seoTitle`
// and `seoDescription` (optional) drive the <title>/meta tags: they lead with
// the page's signature names plus a hook, which earns clicks far better than a
// bare "<X> Baby Names" on competitive SERPs.
const PAGES: Record<string, EditorialPageConfig> = {
  comebacks: {
    title: "Comeback Baby Names",
    seoTitle: "Comeback Baby Names: Why Theodore, Hazel & Eleanor Returned | NobodyNamed",
    seoDescription: "Names that fell out of use and came roaring back — Theodore, Hazel, Eleanor, Violet, Oliver. See which vintage baby names are surging again, with the data behind each revival.",
    eyebrow: "Recovered names",
    lede: "Names that fell out of daily use, waited in the archive, and returned as taste, nostalgia, or status.",
    names: ["Theodore", "Hazel", "Eleanor", "Violet", "Oliver", "Emma"],
    body: "Comebacks reveal that naming culture is cyclical. A name can sound exhausted to one generation and newly authoritative to the next.",
    table: "comeback",
  },
  "millennial-names": {
    title: "Millennial Baby Names",
    seoTitle: "Millennial Baby Names: Michael, Jessica & the '80s–'90s Class | NobodyNamed",
    seoDescription: "The names that filled '80s and '90s classrooms — Michael, Jessica, Ashley, Christopher, Amanda. See the defining millennial baby names and how each one is aging now.",
    eyebrow: "Generation dossier",
    lede: "The classroom names of the 1980s and 1990s: high-volume, unmistakable, and now aging into cultural memory.",
    names: ["Michael", "Jessica", "Ashley", "Christopher", "Amanda", "Matthew"],
    body: `Millennial names are defined by saturation. Many were not merely popular; they were ambient facts of school rosters and suburban life. The <a href="/names/1980s/">1980s decade hub</a> measures exactly which of those names truly belonged to the decade, and even reconstructs an average 1984 classroom from the same records.`,
    sections: [
      {
        heading: "How crowded were millennial classrooms?",
        body: `Millennial names peaked at volumes no later generation has matched. <a href="/name/Jessica/">Jessica</a> reached 55,992 births in 1987, <a href="/name/Ashley/">Ashley</a> 54,856 the same year, and <a href="/name/Christopher/">Christopher</a> 60,021 in 1984. <a href="/name/Amanda/">Amanda</a> topped out at 41,786 in 1987 and <a href="/name/Matthew/">Matthew</a> at 50,209 in 1983. A top name at that scale could put more than one child with the same name in a single grade. The <a href="/year/1987/">1987 year roster</a> shows how deep that crowd ran below the top spot.`,
      },
      {
        heading: "Why millennial names aged so quickly",
        body: `Saturation made these names easy to date. A name that was everywhere in one decade becomes a marker of that decade, and parents choosing a name for a new baby tend to avoid the names of their own classmates. The SSA record shows the result: in 2025, Jessica was given to 424 girls and Amanda to 601, each about 1% of its peak. Ashley fell to 1,829 and Christopher to 4,748. Most of those names are now classified as endangered on NobodyNamed, meaning they have fallen at least 90% from their peak, even though millions of adults still carry them.`,
      },
      {
        heading: "Which millennial names are holding on",
        body: `Not every name from the era collapsed. Matthew still had 7,003 births in 2025, about 14% of its 1983 peak, and <a href="/name/Michael/">Michael</a>, which peaked in 1957 before the millennial years began, still had 8,094. Names with long histories before the 1980s tended to fall more slowly than names that arrived with the generation. Open each dossier above for the full curve, current median age and living-population estimate, or compare the <a href="/names/1980s/">1980s</a> and <a href="/names/1990s/">1990s</a> decade hubs to see which names truly belonged to each decade.`,
      },
    ],
  },
  "gen-z-names": {
    title: "Gen Z Baby Names",
    seoTitle: "Gen Z Baby Names: Madison, Ethan & the 2000s Roster | NobodyNamed",
    seoDescription: "The names that defined Gen Z — Madison, Ethan, Ava, Aiden, Isabella. See how late-'90s and 2000s naming got faster, sharper, and more fashion-driven.",
    eyebrow: "Generation dossier",
    lede: "The names that rose through the late 1990s and 2000s as naming culture became faster, more fragmented, and more image-conscious.",
    names: ["Madison", "Ethan", "Ava", "Aiden", "Isabella", "Jayden"],
    body: "Gen Z naming patterns show sharper fashion cycles, more spelling variation, and a faster path from novelty to overexposure.",
    sections: [
      {
        heading: "Smaller peaks, more names",
        body: `Gen Z's leading names never reached millennial volumes. <a href="/name/Madison/">Madison</a> peaked at 22,166 births in 2001 and <a href="/name/Ethan/">Ethan</a> at 22,210 in 2004, well under half of <a href="/name/Jessica/">Jessica</a>'s 55,992 in 1987. Parents were spreading their choices across many more names, so even a top name was shared by fewer classmates. That fragmentation is the defining statistical trait of the generation, and it continued into the <a href="/names/2010s/">2010s</a>.`,
      },
      {
        heading: "Sound families replaced single names",
        body: `Instead of one dominant name, Gen Z produced clusters of names that share a sound. <a href="/name/Aiden/">Aiden</a> and <a href="/name/Jayden/">Jayden</a> both peaked in 2009, at 16,030 and 17,316 births, sharing the same "-den" ending. Each name's rank understates how popular the sound was, because the births were split across rhymes and spellings. Check the dossiers above to see how closely their curves track each other.`,
      },
      {
        heading: "How Gen Z names are aging so far",
        body: `Gen Z names are fading more slowly than millennial names did, but they have had less time. In 2025, Madison had 4,945 births (22% of its peak), Ethan 7,852 (35%), <a href="/name/Ava/">Ava</a> 7,732 (43%) and <a href="/name/Isabella/">Isabella</a> 10,666 (47%). All four are now classified as declining. Whether they follow Jessica and Ashley toward endangered status is the open question the next few years of SSA data will answer. The <a href="/names/2000s/">2000s decade hub</a> tracks the full roster.`,
      },
    ],
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
    title: "Future Grandparent Names",
    seoTitle: "Future Grandparent Names: Why Harper & Luna Will Sound Old | NobodyNamed",
    seoDescription: "Today's cutest baby names are tomorrow's grandparent names. See why Harper, Luna, Mason, and Ava are on track to age into the next generation of \"old\" names.",
    eyebrow: "Forecast by memory",
    lede: "The names that may sound young now, then ordinary, then old, then charmingly available again.",
    names: ["Harper", "Luna", "Mason", "Ava", "Liam", "Olivia"],
    body: "Every cute contemporary name is also a future old-person name. That is not an insult; it is the entire lifecycle of cultural identity.",
    sections: [
      {
        heading: "Where today's names sit in the cycle",
        body: `Some of today's favorites are at or near their peak. <a href="/name/Liam/">Liam</a> peaked at 22,252 births in 2024 and still had 20,818 in 2025. <a href="/name/Olivia/">Olivia</a> peaked at 19,840 in 2014 and had 13,544 in 2025. <a href="/name/Luna/">Luna</a> reached 8,977 in 2022 and had 6,076 in 2025. Others are already past their high point: <a href="/name/Harper/">Harper</a> peaked at 10,803 in 2016 and fell to 6,792, and <a href="/name/Mason/">Mason</a> peaked at 19,530 in 2011 and fell to 6,291.`,
      },
      {
        heading: "What the last generation's names predict",
        body: `The <a href="/millennial-names">millennial names</a> show where this path usually leads. Jessica and Amanda each peaked in 1987, and by 2025 both were given to about 1% as many babies as at their peak. Their bearers are now in their late thirties, and the names read as belonging to adults rather than children. Nothing guarantees today's names will follow the same curve, but the SSA record shows the same arc again and again: the names that fill one generation's classrooms come to sound like that generation.`,
      },
      {
        heading: "A forecast, not a verdict",
        body: `Sounding old is not the end of a name's story. <a href="/comeback">Comeback names</a> such as Hazel and Theodore spent decades as grandparent names before parents rediscovered them, and <a href="/classic-names">classic names</a> like James and Elizabeth avoided being tied to one generation at all. Open the dossiers above to follow each name's curve, current births and median age. The names with the steepest rises are the ones most likely to date quickly.`,
      },
    ],
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
  const staticPages = new Set(["extinct", "rising", "endangered", "comeback", "year", "about", "press", "emerging", "fading"]);
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
      } else if (slug in MOMENTUM_ROUTES) {
        const direction = MOMENTUM_ROUTES[slug as MomentumRouteName]!;
        const rows = await listMomentum(ctx.env.DB, direction, { limit: SSR_HUB_ROWS });
        const grid = renderMomentumGridHTML(direction, rows);
        html = html.replace('<div id="t"></div>', `<div id="t">${grid}</div>`);
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
  // Every editorial hub gets sparkline cards (previously classic-names only).
  {
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
  const pageTitle = page.title;
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
    <h1>${pageTitle}</h1>
    <p class="lede">${page.lede}</p>
    <p class="archive-note">${page.body}</p>
    <div class="diagnosis-grid" ${contentIdentityMeta({ contentId: contentId("article", slug), contentType: "article", slug })}>${cards}</div>
    ${editorialSections}
    ${table}
  `,
    structuredData: JSON.parse(structuredData),
    scripts: [APP_JS_SRC, LANDING_JS_SRC],
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
