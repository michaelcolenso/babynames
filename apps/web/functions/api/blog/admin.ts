// POST /api/blog/admin
//
// Admin endpoint for creating or updating blog posts.
//
// Authentication (tried in order):
//   1. Cloudflare Access        — checks for the Cf-Access-Authenticated-User-Email
//      header injected by Cloudflare Access after authenticating the user at the
//      edge. Cloudflare strips any Cf-Access-* headers from external requests, so
//      this header cannot be spoofed — if it's present, the request passed through
//      Access authentication. No JWT verification is needed in the function.
//      Requires Cloudflare Access configured in front of this path.
//   2. Shared secret            — Bearer token checked against BLOG_ADMIN_SECRET.
//      Falls back to this when no Access headers are present (e.g. local dev).
//   3. Open (dev only)          — when neither is configured, the endpoint is
//      unprotected. Set at least one auth method in production.
//
// Body: JSON matching the upsertBlogPost parameter shape.

import { upsertBlogPost } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  // ── Tier 1: Cloudflare Access (header presence check) ─────────────────
  // Cloudflare Access strips any Cf-Access-* headers from incoming requests
  // and only injects them after authenticating the user. The presence of
  // Cf-Access-Authenticated-User-Email therefore guarantees the request
  // passed through Access authentication — no JWT crypto required.
  const accessEmail = ctx.request.headers.get("Cf-Access-Authenticated-User-Email");
  if (accessEmail) {
    console.log(`blog/admin: authenticated as ${accessEmail} via Cloudflare Access`);
    return handleUpsert(ctx);
  }

  // ── Tier 2: Shared secret (Bearer token) ───────────────────────────────
  const secret = ctx.env.BLOG_ADMIN_SECRET;
  if (secret) {
    const auth = ctx.request.headers.get("Authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (provided !== secret) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    console.log(`blog/admin: authenticated via shared secret`);
    return handleUpsert(ctx);
  }

  // ── Tier 3: Open (no auth configured) ──────────────────────────────────
  // Set up Cloudflare Access in front of /api/blog/admin, or set
  // BLOG_ADMIN_SECRET as a Pages environment variable.

  console.warn(`blog/admin: no auth configured — endpoint is open`);
  return handleUpsert(ctx);
};

async function handleUpsert(ctx: Parameters<PagesFunction<Env>>[0]): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const bodyHtml = typeof body.bodyHtml === "string" ? body.bodyHtml : "";
  const status = body.status === "published" ? "published" : "draft";
  const author = typeof body.author === "string" ? body.author.trim() : "";
  const ogImage = typeof body.ogImage === "string" ? body.ogImage.trim() : null;
  const publishedAt = typeof body.publishedAt === "string" ? body.publishedAt : null;

  if (!slug || !title) {
    return Response.json({ error: "slug and title are required" }, { status: 400 });
  }

  await upsertBlogPost(ctx.env.DB, {
    slug,
    title,
    description,
    bodyHtml,
    status,
    author,
    ogImage,
    publishedAt: status === "published" ? (publishedAt ?? new Date().toISOString()) : publishedAt,
  });

  return Response.json({ ok: true, slug }, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
