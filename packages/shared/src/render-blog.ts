// HTML renderers for blog pages. Used by:
//   - apps/web SSR Functions (full page, edge-cached)
//   - /blog/ — post index
//   - /blog/:slug/ — single post

import type { BlogPost, BlogPostSummary } from "./schema";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function siteHeader(currentPath?: string): string {
  const blogActive = currentPath?.startsWith("/blog") ? ' class="active"' : "";
  return `<header class="site">
    <a class="brand" href="/">nobodynamed</a>
    <nav>
      <a href="/extinct">Extinct</a>
      <a href="/endangered">Endangered</a>
      <a href="/comeback">Comebacks</a>
      <a href="/year">Birth year</a>
      <a href="/rising">Rising</a>
      <a href="/viz">Visualizations</a>
      <a href="/blog/"${blogActive}>Blog</a>
      <a href="/about">About</a>
    </nav>
    <details class="mobile-nav">
      <summary aria-label="Open navigation"><span></span><span></span><span></span></summary>
      <nav>
        <a href="/extinct">Extinct</a>
        <a href="/endangered">Endangered</a>
        <a href="/comeback">Comebacks</a>
        <a href="/year">Birth year</a>
        <a href="/rising">Rising</a>
        <a href="/viz">Visualizations</a>
        <a href="/blog/">Blog</a>
        <a href="/about">About</a>
      </nav>
    </details>
  </header>`;
}

function siteFooter(): string {
  return `<footer class="site">
    <div>
      <div>nobodynamed is a small data project about American first names.</div>
      <div class="footer-note">Built on public-domain Social Security Administration data: about 100,000 name/sex records and 2 million yearly observations.</div>
    </div>
    <div><a href="/about">About</a> &middot; <a href="https://www.ssa.gov/oact/babynames/">SSA source</a></div>
  </footer>`;
}

function postMetaTags(post: BlogPost, canonical: string, origin: string): string {
  const title = `${escape(post.title)} — NobodyNamed Blog`;
  const desc = escape(post.description);
  const ogImage = post.ogImage ?? `${origin}/api/og/default`;
  return `<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${escape(canonical)}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="article">
<meta property="og:url" content="${escape(canonical)}">
<meta property="og:image" content="${escape(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escape(ogImage)}">`;
}

// ─── Blog index page ────────────────────────────────────────────────────────

export function renderBlogIndex(
  posts: BlogPostSummary[],
  opts: { canonical: string; origin?: string },
): string {
  const origin = opts.origin || new URL(opts.canonical).origin;
  const title = "Blog — NobodyNamed";
  const desc = "Notes on American naming culture, data, and the names that shape generations.";

  const cards = posts.length
    ? posts
        .map(
          (p) => `
  <article class="blog-card">
    <h2><a href="/blog/${encodeURIComponent(p.slug)}/">${escape(p.title)}</a></h2>
    <p class="blog-card-desc">${escape(p.description)}</p>
    <div class="blog-card-meta">
      ${p.publishedAt ? `<time datetime="${escape(p.publishedAt)}">${fmtDate(p.publishedAt)}</time>` : ""}
      ${p.author ? `<span>by ${escape(p.author)}</span>` : ""}
    </div>
  </article>`,
        )
        .join("")
    : `<p class="lede">No posts yet. Check back soon.</p>`;

  const structuredData = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        { "@type": "ListItem", position: 2, name: "Blog", item: opts.canonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "NobodyNamed Blog",
      url: opts.canonical,
      description: desc,
      blogPost: posts.map((p) => ({
        "@type": "BlogPosting",
        headline: p.title,
        description: p.description,
        url: `${origin}/blog/${encodeURIComponent(p.slug)}/`,
        datePublished: p.publishedAt,
      })),
    },
  ]).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(desc)}">
<link rel="canonical" href="${escape(opts.canonical)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escape(opts.canonical)}">
<meta property="og:image" content="${origin}/api/og/default">
<meta name="twitter:card" content="summary">
<meta name="twitter:image" content="${origin}/api/og/default">
<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<link rel="preload" href="/assets/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/assets/style.css"></noscript>
<script type="application/ld+json">${structuredData}</script>
</head>
<body>
<div class="page">
  ${siteHeader("/blog")}
  <main>
    <p class="eyebrow">Journal</p>
    <h1>NobodyNamed Blog</h1>
    <p class="lede">${escape(desc)}</p>
    <div class="blog-index">
      ${cards}
    </div>
  </main>
  ${siteFooter()}
</div>
</body>
</html>`;
}

// ─── Single blog post page ──────────────────────────────────────────────────

export function renderBlogPost(
  post: BlogPost,
  opts: { canonical: string; origin?: string },
): string {
  const origin = opts.origin || new URL(opts.canonical).origin;
  const ogImage = post.ogImage ?? `${origin}/api/og/default`;

  const structuredData = JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
        { "@type": "ListItem", position: 2, name: "Blog", item: origin + "/blog/" },
        { "@type": "ListItem", position: 3, name: post.title, item: opts.canonical },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url: opts.canonical,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: post.author
        ? {
            "@type": "Person",
            name: post.author,
          }
        : undefined,
      image: ogImage,
    },
  ]).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${postMetaTags(post, opts.canonical, origin)}
<meta name="theme-color" content="#f7f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<link rel="preload" href="/assets/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="/assets/style.css"></noscript>
<script type="application/ld+json">${structuredData}</script>
</head>
<body>
<div class="page">
  ${siteHeader("/blog")}
  <main>
    <article class="blog-post">
      <header class="blog-post-header">
        <p class="eyebrow"><a href="/blog/">← Blog</a></p>
        <h1>${escape(post.title)}</h1>
        <div class="blog-post-meta">
          ${post.publishedAt ? `<time datetime="${escape(post.publishedAt)}">${fmtDate(post.publishedAt)}</time>` : ""}
          ${post.author ? `<span>by ${escape(post.author)}</span>` : ""}
        </div>
      </header>
      <div class="blog-post-body">
        ${post.bodyHtml}
      </div>
    </article>
  </main>
  ${siteFooter()}
</div>
</body>
</html>`;
}
