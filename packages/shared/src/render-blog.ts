// HTML renderers for blog pages. Used by:
//   - apps/web SSR Functions (full page, edge-cached)
//   - /blog/ — post index
//   - /blog/:slug/ — single post

import { chunkedIn } from "./d1-chunk";
import { pageShell } from "./render-shell";
import type { BlogPost, BlogPostSummary } from "./schema";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Resolve a post's og:image: honor an explicit og_image (absolute or
// root-relative), otherwise fall back to the per-post generated card.
function resolveOgImage(post: BlogPost, origin: string): string {
  const fallback = `${origin}/api/og/blog/${encodeURIComponent(post.slug)}`;
  const ogImage = post.ogImage;
  if (!ogImage) return fallback;
  if (ogImage.startsWith("http://") || ogImage.startsWith("https://")) return ogImage;
  if (ogImage.startsWith("/")) return `${origin}${ogImage}`;
  return fallback;
}

/**
 * Extract capitalized words from HTML text content, check which ones exist
 * as names in D1, and wrap them in links to their dossier pages.
 * Existing anchors are left alone so imported Markdown links do not nest.
 */
const AUTOLINK_BLOCKLIST = new Set([
  "a",
  "about",
  "above",
  "across",
  "after",
  "against",
  "along",
  "among",
  "an",
  "and",
  "are",
  "around",
  "as",
  "at",
  "be",
  "been",
  "being",
  "beneath",
  "beside",
  "between",
  "beyond",
  "both",
  "but",
  "by",
  "can",
  "cannot",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "done",
  "down",
  "during",
  "each",
  "every",
  "few",
  "for",
  "from",
  "further",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "hers",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "inside",
  "into",
  "is",
  "it",
  "its",
  "just",
  "many",
  "may",
  "me",
  "might",
  "more",
  "most",
  "much",
  "must",
  "my",
  "near",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "onto",
  "or",
  "other",
  "our",
  "ours",
  "out",
  "outside",
  "over",
  "own",
  "same",
  "shall",
  "she",
  "should",
  "since",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "throughout",
  "till",
  "to",
  "too",
  "toward",
  "under",
  "until",
  "up",
  "upon",
  "us",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "whom",
  "whose",
  "why",
  "will",
  "with",
  "within",
  "without",
  "would",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "america",
  "american",
  "americas",
  "april",
  "august",
  "brazil",
  "celebrity",
  "data",
  "december",
  "february",
  "gen",
  "january",
  "july",
  "june",
  "march",
  "name",
  "names",
  "night",
  "november",
  "october",
  "season",
  "september",
  "three",
  "twilight",
  "victorian",
  "western",
  "year",
  "years",
  "arsenios",
  "brandy",
  "chelsea",
  "hall",
  "jennings",
  "kinte",
  "kwon",
  "silva",
  "smith",
]);

const UNLINK_NAME_LINKS = new Set([
  "america",
  "american",
  "americas",
  "april",
  "august",
  "celebrity",
  "data",
  "december",
  "february",
  "january",
  "july",
  "june",
  "march",
  "name",
  "names",
  "night",
  "november",
  "october",
  "season",
  "september",
  "three",
  "twilight",
  "victorian",
  "western",
  "year",
  "years",
  "you",
  "your",
  "yours",
]);

export async function linkifyBlogBody(html: string, db: D1Database): Promise<string> {
  html = sanitizeNameLinks(html);

  const candidates = new Set<string>();
  transformTextOutsideAnchors(html, (text) => {
    const words = text.match(/\b[A-Z][a-zA-Z]+\b/g);
    if (words) {
      for (const w of words) {
        const lower = w.toLowerCase();
        if (w.length >= 2 && !AUTOLINK_BLOCKLIST.has(lower)) candidates.add(lower);
      }
    }
    return text;
  });

  if (candidates.size === 0) return html;

  // Look up which candidates exist as names. The variable-length IN list is
  // batched via chunkedIn so it stays under D1's deployed bound-variable ceiling
  // (the 50-state "signature name" post yields hundreds of candidates).
  const list = Array.from(candidates).filter((s) => s.length > 0);
  const rows = await chunkedIn<{ name: string }>(
    db,
    list,
    (ph) => `SELECT DISTINCT name FROM names WHERE name_lower IN (${ph})`,
  );
  const names = new Set<string>();
  for (const r of rows) names.add(r.name.toLowerCase());

  if (names.size === 0) return html;

  const linkedNames = existingNameLinks(html);
  return transformTextOutsideAnchors(html, (text) =>
    text.replace(/\b([A-Z][a-zA-Z]+)\b/g, (wordMatch: string, word: string) => {
      const lower = word.toLowerCase();
      if (names.has(lower) && !linkedNames.has(lower)) {
        linkedNames.add(lower);
        return `<a href="/name/${encodeURIComponent(word)}/">${word}</a>`;
      }
      return wordMatch;
    }),
  );
}

function sanitizeNameLinks(html: string): string {
  const linked = new Set<string>();
  return html.replace(
    /<a\b([^>]*?)\bhref=(["'])(?:https?:\/\/[^/"']+)?\/name\/([^/"'?#]+)\/?\2([^>]*)>(.*?)<\/a>/gis,
    (match: string, beforeHref: string, quote: string, slug: string, afterHref: string, label: string) => {
      const lower = decodeURIComponent(slug).toLowerCase();
      if (UNLINK_NAME_LINKS.has(lower) || linked.has(lower)) return label;
      linked.add(lower);
      return match;
    },
  );
}

function existingNameLinks(html: string): Set<string> {
  const linked = new Set<string>();
  const pattern = /\bhref=["'](?:https?:\/\/[^/"']+)?\/name\/([^/"'?#]+)\/?["']/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1];
    if (raw) linked.add(decodeURIComponent(raw).toLowerCase());
  }
  return linked;
}

function transformTextOutsideAnchors(html: string, transform: (text: string) => string): string {
  let anchorDepth = 0;
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part) return part;
      if (part.startsWith("<")) {
        if (/^<a\b/i.test(part)) anchorDepth += 1;
        else if (/^<\/a\s*>/i.test(part)) anchorDepth = Math.max(0, anchorDepth - 1);
        return part;
      }
      return anchorDepth > 0 ? part : transform(part);
    })
    .join("");
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



function wordCount(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

const PUBLISHER_ORG = {
  "@type": "Organization" as const,
  name: "NobodyNamed",
  url: "https://nobodynamed.com/",
};

// ─── Blog index page ────────────────────────────────────────────────────────

export function renderBlogIndex(posts: BlogPostSummary[], opts: { canonical: string; origin?: string }): string {
  const origin = opts.origin || new URL(opts.canonical).origin;
  const title = "Namecalling — NobodyNamed";
  const desc = "Charts and notes on American naming culture, data, and the names that shape generations.";

  const cards = posts.length
    ? posts
        .map(
          (p) => `
  <article class="blog-card">
    <h2><a href="/blog/${encodeURIComponent(p.slug)}/">${escape(p.title)}</a></h2>
    <p class="blog-card-desc">${escape(p.description)}</p>
    ${
      p.publishedAt || p.author
        ? `<div class="blog-card-meta">
      ${p.publishedAt ? `<time datetime="${escape(p.publishedAt)}">${fmtDate(p.publishedAt)}</time>` : ""}
      ${p.author ? `<span>by ${escape(p.author)}</span>` : ""}
    </div>`
        : ""
    }
  </article>`,
        )
        .join("")
    : `<p class="lede">No posts yet. Check back soon.</p>`;

  return pageShell({
    title,
    description: desc,
    canonical: opts.canonical,
    ogImage: `${origin}/api/og/default`,
    ogType: "website",
    twitterCard: "summary",
    currentPath: "/blog",
    body: `
    <p class="eyebrow">Journal</p>
    <h1>Namecalling</h1>
    <p class="lede">${escape(desc)}</p>
    <div class="blog-index">
      ${cards}
    </div>
  `,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
          { "@type": "ListItem", position: 2, name: "Namecalling", item: opts.canonical },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Namecalling",
        url: opts.canonical,
        description: desc,
        publisher: PUBLISHER_ORG,
        inLanguage: "en-US",
        blogPost: posts.map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          description: p.description,
          url: `${origin}/blog/${encodeURIComponent(p.slug)}/`,
          datePublished: p.publishedAt,
          author: p.author ? { "@type": "Person", name: p.author } : undefined,
        })),
      },
    ],
    footerVariant: "full",
  });
}

// ─── Single blog post page ──────────────────────────────────────────────────

export function renderBlogPost(post: BlogPost, opts: { canonical: string; origin?: string }): string {
  const origin = opts.origin || new URL(opts.canonical).origin;
  const ogImage = resolveOgImage(post, origin);
  const title = `${post.title} | NobodyNamed`;

  const wc = wordCount(post.bodyHtml);
  const hasModified = post.updatedAt && post.updatedAt !== post.publishedAt;
  const blogSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url: opts.canonical,
    datePublished: post.publishedAt,
    author: post.author
      ? {
          "@type": "Person",
          name: post.author,
        }
      : undefined,
    image: ogImage,
    publisher: PUBLISHER_ORG,
    inLanguage: "en-US",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": opts.canonical,
    },
    wordCount: wc > 0 ? wc : undefined,
  };
  if (hasModified) {
    blogSchema.dateModified = post.updatedAt;
  }

  return pageShell({
    title,
    description: post.description,
    canonical: opts.canonical,
    ogImage,
    ogImageAlt: post.title,
    ogType: "article",
    currentPath: "/blog",
    body: `
    <article class="blog-post">
      <header class="blog-post-header">
        <p class="eyebrow"><a href="/blog/">← Namecalling</a></p>
        <h1>${escape(post.title)}</h1>
        ${
          post.publishedAt || post.author
            ? `<div class="blog-post-meta">
          ${post.publishedAt ? `<time datetime="${escape(post.publishedAt)}">${fmtDate(post.publishedAt)}</time>` : ""}
          ${post.author ? `<span>by ${escape(post.author)}</span>` : ""}
        </div>`
            : ""
        }
      </header>
      <div class="blog-post-body">
        ${post.bodyHtml}
      </div>
    </article>
  `,
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: origin + "/" },
          { "@type": "ListItem", position: 2, name: "Namecalling", item: origin + "/blog/" },
          { "@type": "ListItem", position: 3, name: post.title, item: opts.canonical },
        ],
      },
      blogSchema,
    ],
    footerVariant: "full",
  });
}
