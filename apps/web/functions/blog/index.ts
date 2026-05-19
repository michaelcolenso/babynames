// GET /blog/  → server-rendered HTML
//
// Blog index page listing published posts, ordered by publish date descending.
// Edge-cached with stale-while-revalidate.

import { listBlogPosts, renderBlogIndex } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const posts = await listBlogPosts(ctx.env.DB, "published", 50, 0);
  const url = new URL(ctx.request.url);
  const canonical = `${url.origin}/blog/`;

  const html = renderBlogIndex(posts, { canonical });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
