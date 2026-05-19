// GET /api/blog/post/:slug
// Returns a single published blog post by slug.

import { getBlogPost, type BlogPost } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env, "slug"> = async (ctx) => {
  const slug = ctx.params.slug;
  if (typeof slug !== "string" || !slug) {
    return Response.json({ error: "missing slug" }, { status: 400 });
  }

  const post: BlogPost | null = await getBlogPost(ctx.env.DB, slug);

  if (!post) {
    return Response.json(
      { error: "not_found" },
      {
        status: 404,
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
      },
    );
  }

  return Response.json(post, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
