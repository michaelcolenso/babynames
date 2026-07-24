import { contentId, contentIdentityMeta, pageShell, renderNewsletterSignup } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const identity = {
    contentId: contentId("franchise-hub", "american-name-atlas"),
    contentType: "franchise-hub" as const,
    slug: "american-name-atlas",
  };
  const identityMeta = contentIdentityMeta(identity);
  const html = pageShell({
    title: "American Name Atlas | NobodyNamed",
    description: "State-by-state stories about the names America uses at unusually high rates.",
    canonical: `${url.origin}/stories/american-name-atlas`,
    currentPath: "/stories/american-name-atlas",
    body: `<article ${identityMeta}><p class="eyebrow">Flagship franchise</p><h1>American Name Atlas</h1><p class="lede">Every state has names it uses at rates far above the national norm. This series turns those statistical outliers into sourced, reproducible stories about migration, religion, language, local heroes, and regional identity.</p><section class="section"><h2>What qualifies</h2><p>Each installment starts with reliability thresholds, national comparison rates, and a denominator check before moving into cultural interpretation. Statistical facts and historical interpretation stay visibly separate.</p></section>${renderNewsletterSignup("franchise-hub", identity.contentId)}</article>`,
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
};
