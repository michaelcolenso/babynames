// POST /api/blog/admin
//
// Admin endpoint for creating or updating blog posts.
//
// Authentication (tried in order):
//   1. Cloudflare Access JWT  — verifies the Cf-Access-Jwt-Assertion header
//      against the team's JWKS. Requires CF_ACCESS_TEAM_DOMAIN and
//      CF_ACCESS_AUD to be set as environment variables.
//   2. Shared secret           — Bearer token checked against BLOG_ADMIN_SECRET.
//      Falls back to this when no Access headers are present.
//   3. Open (dev only)         — when neither is configured, the endpoint is
//      unprotected. Set at least one auth method in production.
//
// Body: JSON matching the upsertBlogPost parameter shape.

import { upsertBlogPost, verifyAccessJwt } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  // ── Tier 1: Cloudflare Access JWT ──────────────────────────────────────
  const teamDomain = ctx.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = ctx.env.CF_ACCESS_AUD;

  if (teamDomain && aud) {
    try {
      const email = await verifyAccessJwt(ctx.request, { teamDomain, aud });
      if (email) {
        // Log the authenticated identity so there's an audit trail.
        console.log(`blog/admin: authenticated as ${email} via Cloudflare Access`);
        return handleUpsert(ctx);
      }
    } catch (err) {
      console.error(`blog/admin: Access JWT verification failed: ${String(err)}`);
      return Response.json(
        { error: "access_denied", reason: String(err) },
        { status: 401 },
      );
    }
    // No Access headers present — fall through to shared secret.
  }

  // ── Tier 2: Shared secret (Bearer token) ───────────────────────────────
  const secret = ctx.env.BLOG_ADMIN_SECRET;
  if (secret) {
    const auth = ctx.request.headers.get("Authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (provided !== secret) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // ── Tier 3: Open (no auth configured) ──────────────────────────────────
  // In production, set either CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD or
  // BLOG_ADMIN_SECRET to protect this endpoint.

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
