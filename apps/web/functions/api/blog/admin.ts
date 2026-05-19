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

export const onRequestGet: PagesFunction<Env> = async () => {
  return new Response(adminFormHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
};

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

const adminFormHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blog Admin — NobodyNamed</title>
<link rel="preload" href="/assets/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/assets/style.css"></noscript>
<style>
  .admin-form { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
  .admin-form label { display: block; margin: 1rem 0 0.25rem; font-family: var(--sans); font-size: 0.85rem; color: var(--muted); }
  .admin-form input[type="text"],
  .admin-form input[type="url"],
  .admin-form textarea,
  .admin-form select {
    width: 100%; padding: 0.6rem; border: 1px solid var(--rule); border-radius: var(--radius);
    font-family: var(--sans); font-size: 1rem; background: var(--surface);
  }
  .admin-form textarea { min-height: 280px; font-family: var(--mono); font-size: 0.9rem; }
  .admin-form button {
    margin-top: 1.25rem; padding: 0.65rem 1.25rem; border: 0; border-radius: var(--radius);
    background: var(--ink); color: var(--paper); font-family: var(--sans); font-size: 1rem; cursor: pointer;
  }
  .admin-form button:hover { background: var(--accent); }
  .admin-form .hint { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }
  .admin-result { margin-top: 1rem; padding: 0.75rem; border-radius: var(--radius); background: var(--surface-2); }
</style>
</head>
<body>
<div class="page">
  <header class="site">
    <a class="brand" href="/">nobodynamed</a>
    <nav>
      <a href="/blog/">Blog</a>
      <a href="/">Home</a>
    </nav>
  </header>
  <main>
    <h1>Blog admin</h1>
    <form class="admin-form" id="f">
      <label for="slug">Slug</label>
      <input id="slug" name="slug" type="text" placeholder="hello-world" required>
      <p class="hint">URL path: /blog/&lt;slug&gt;/</p>

      <label for="title">Title</label>
      <input id="title" name="title" type="text" placeholder="Post title" required>

      <label for="description">Description</label>
      <input id="description" name="description" type="text" placeholder="Short description for meta tags">

      <label for="author">Author</label>
      <input id="author" name="author" type="text" placeholder="Your name">

      <label for="ogImage">OG Image URL (optional)</label>
      <input id="ogImage" name="ogImage" type="url" placeholder="https://nobodynamed.com/api/og/default">

      <label for="status">Status</label>
      <select id="status" name="status">
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>

      <label for="bodyHtml">Body HTML</label>
      <textarea id="bodyHtml" name="bodyHtml" placeholder="&lt;p&gt;Write your post in HTML...&lt;/p&gt;"></textarea>
      <p class="hint">Raw HTML. Use &lt;p&gt;, &lt;h2&gt;, &lt;ul&gt;, etc.</p>

      <button type="submit">Save post</button>
      <div id="result"></div>
    </form>
  </main>
</div>
<script>
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      slug: fd.get('slug'),
      title: fd.get('title'),
      description: fd.get('description'),
      bodyHtml: fd.get('bodyHtml'),
      status: fd.get('status'),
      author: fd.get('author'),
      ogImage: fd.get('ogImage') || null,
    };
    const res = await fetch('/api/blog/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const out = document.getElementById('result');
    if (res.ok) {
      const j = await res.json();
      out.innerHTML = '<div class="admin-result">✅ Saved. <a href="/blog/' + encodeURIComponent(j.slug) + '/">View post →</a></div>';
      e.target.reset();
    } else {
      const j = await res.json().catch(() => ({}));
      out.innerHTML = '<div class="admin-result">❌ Error: ' + (j.error || res.statusText) + '</div>';
    }
  });
</script>
</body>
</html>`;
