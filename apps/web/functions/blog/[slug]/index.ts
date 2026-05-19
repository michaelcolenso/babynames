// GET /blog/:slug/  → server-rendered HTML
//
// Single blog post page. Hits D1 by slug, renders full HTML.

import { getBlogPost, renderBlogPost } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env, "slug"> = async (ctx) => {
  const slug = ctx.params.slug;
  if (typeof slug !== "string" || !slug) {
    return new Response("missing slug", { status: 400 });
  }

  const post = await getBlogPost(ctx.env.DB, slug);

  if (!post) {
    return new Response(renderNotFound(slug), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  }

  const url = new URL(ctx.request.url);
  const canonical = `${url.origin}/blog/${encodeURIComponent(slug)}/`;

  const html = renderBlogPost(post, { canonical });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      Link: `<${canonical}>; rel="canonical"`,
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

function renderNotFound(slug: string): string {
  const safe = slug.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Post not found — Namecalling</title>
<link rel="preload" href="/assets/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/assets/style.css"></noscript>
</head><body><div class="page">
<header class="site"><a class="brand" href="/" aria-label="NobodyNamed home"><img class="brand-logo" src="/assets/brand/wordmark.svg" alt="nobodynamed"></a></header>
<main>
  <h1>Post not found</h1>
  <p class="lede">No blog post with that address.</p>
  <p><a href="/blog/">← Namecalling</a></p>
</main>
</div></body></html>`;
}
