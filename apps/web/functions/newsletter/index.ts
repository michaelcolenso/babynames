import { contentId, contentIdentityMeta, pageShell, renderNewsletterSignup } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const identityMeta = contentIdentityMeta({
    contentId: contentId("newsletter", "archive"),
    contentType: "newsletter",
    slug: "archive",
  });
  const html = pageShell({
    title: "NobodyNamed Newsletter Archive",
    description: "A weekly note about surprising patterns in American baby-name data.",
    canonical: `${url.origin}/newsletter`,
    currentPath: "/newsletter",
    body: `<div ${identityMeta}><p class="eyebrow">Newsletter</p><h1>One surprising pattern in American names each week</h1><p class="lede">The public archive will collect American Name Atlas dispatches, data notes, and visual essays.</p>${renderNewsletterSignup("newsletter-archive")}</div>`,
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
};
