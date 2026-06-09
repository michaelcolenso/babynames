// Root-level editorial route aliases required for programmatic SEO.

import {
  decodeSpark,
  getMeta,
  listComeback,
  listLandingWithSparks,
  META_KEYS,
  pageShell,
  renderLandingTableHTML,
  renderYearIndexHTML,
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
const PAGES: Record<
  string,
  { title: string; seoTitle?: string; seoDescription?: string; eyebrow: string; lede: string; names: string[]; body: string; table?: string }
> = {
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
    title: "Classic Baby Names | NobodyNamed",
    seoTitle: "Classic Baby Names: James, Elizabeth & Names That Never Date | NobodyNamed",
    seoDescription: "Names that survived every fashion cycle — James, Elizabeth, William, Anna, John. See the classic baby names that stayed legible across a century of American births.",
    eyebrow: "Durability file",
    lede: "Names that resisted the sharpest boom-and-bust cycles and remained legible across American generations.",
    names: ["James", "Elizabeth", "William", "Anna", "John", "Mary"],
    body: "Classic names derive power from repetition. They do not need a single peak moment because they carry institutional memory across eras.",
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

  const cards = page.names.map((name) =>
    `<a class="diagnosis-card" href="/name/${encodeURIComponent(name)}/"><span class="card-name">${name}</span><span class="card-status">Open dossier</span></a>`,
  ).join("");
  const table = page.table ? `<section class="section"><div id="t"></div></section>` : "";
  const tableScript = page.table ? `<script>renderLandingTable("${page.table}", document.getElementById("t"));</script>` : "";

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
