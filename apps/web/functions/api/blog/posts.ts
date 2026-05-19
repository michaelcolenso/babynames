// GET /api/blog/posts
// Returns a paginated list of published blog post summaries.

import { listBlogPosts, type BlogPostSummary } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const limit = clamp(parseInt(url.searchParams.get("limit") || "20", 10), 1, 50);
  const offset = clamp(parseInt(url.searchParams.get("offset") || "0", 10), 0, 10000);

  const posts: BlogPostSummary[] = await listBlogPosts(ctx.env.DB, "published", limit, offset);

  return Response.json(posts, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};

function clamp(n: number, min: number, max: number): number {
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
